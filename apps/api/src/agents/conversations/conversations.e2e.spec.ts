/**
 * E2E tests for the Conversation Persistence API (spec-15).
 *
 * Flow exercised:
 *   POST   /api/agents/:id/conversations           → create
 *   POST   /api/agents/:id/conversations/:convId/chat  → send message, get reply
 *   GET    /api/agents/:id/conversations/:convId   → verify messages persisted
 *   GET    /api/agents/:id/conversations            → list includes conversation
 *   DELETE /api/agents/:id/conversations/:convId   → soft-delete
 *   GET    /api/agents/:id/conversations/:convId   → 404 after delete
 */
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import {
  AUTH_TOKEN_VERIFIER,
  CoreModule,
  DRIZZLE_CLIENT,
  DrizzleModule,
  schema,
  type AuthTokenVerifier,
  type DbClient,
} from '@forge-core/core';
import { AgentsModule } from '../agents.module';

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Hello from mock.' }],
        usage: { input_tokens: 8, output_tokens: 4 },
      }),
    },
  })),
}));

// ─── Constants ─────────────────────────────────────────────────────────────────

const ORG = 'org_conv_e2e';
const TOKEN = 'test-token';
const AGENT_ID = randomUUID();
const CONV_ID = randomUUID();

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type AgentRow = {
  id: string;
  orgId: string;
  workspaceId: string | null;
  name: string;
  status: string;
  templateId: string | null;
  agentTypeSlug: string;
  uiConfig: Record<string, unknown> | null;
  aiConfig: Record<string, unknown> | null;
  shareToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type ConvRow = {
  id: string;
  orgId: string;
  agentId: string;
  workspaceChannelId: string | null;
  externalUserRef: string | null;
  externalThreadRef: string | null;
  title: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type MessageRow = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const testAgent: AgentRow = {
  id: AGENT_ID,
  orgId: ORG,
  workspaceId: null,
  name: 'Conv Test Agent',
  status: 'live',
  templateId: null,
  agentTypeSlug: 'support',
  uiConfig: {
    identity: { tone: 'friendly', welcomeMessage: 'Hi!' },
    behaviour: { systemPrompt: 'You are a test agent.' },
    channels: ['Web'],
  },
  aiConfig: null,
  // Non-null shareToken bypasses ensureLiveShareToken's update().returning() call
  shareToken: 'share_e2e_test',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

// ─── In-memory DB factory ──────────────────────────────────────────────────────

/**
 * Returns an augmented Promise supporting Drizzle ORM chaining:
 *   .orderBy(), .limit(), .offset() — all return the same resolved value.
 * This lets the mock handle both bare `await where(...)` and chained queries.
 */
function makeQueryResult<T>(items: T[]) {
  const p = Promise.resolve(items) as Promise<T[]> & {
    orderBy: jest.Mock;
    limit: jest.Mock;
    offset: jest.Mock;
  };
  p.orderBy = jest.fn(() => makeQueryResult(items));
  p.limit = jest.fn(() => makeQueryResult(items));
  p.offset = jest.fn(() => Promise.resolve(items));
  return p;
}

/**
 * In-memory DB supporting:
 * - agents select (always returns testAgent)
 * - conversations insert/select/update (mutable store, tracked by closure)
 * - tx.insert(conversationMessages) (writes to shared messages store via proper async)
 * - agentKnowledge* (empty)
 */
function createInMemoryDb(): DbClient {
  const conversations: ConvRow[] = [];
  const messages: MessageRow[] = [];

  return {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => {
        if (table === schema.agentKnowledgeSourceSelections) {
          return { where: jest.fn(() => makeQueryResult([])) };
        }
        if (table === schema.agentKnowledgeItems) {
          return { where: jest.fn(() => makeQueryResult([])) };
        }
        if (table === schema.conversations) {
          return {
            where: jest.fn(() =>
              makeQueryResult(
                conversations.filter(
                  (c) => c.orgId === ORG && c.agentId === AGENT_ID && !c.deletedAt,
                ),
              ),
            ),
          };
        }
        if (table === schema.conversationMessages) {
          return {
            where: jest.fn(() =>
              makeQueryResult(
                messages.filter((m) =>
                  conversations.some((c) => c.id === m.conversationId && !c.deletedAt),
                ),
              ),
            ),
          };
        }
        // agents (default)
        return { where: jest.fn(() => makeQueryResult([testAgent])) };
      }),
    })),

    insert: jest.fn((table: unknown) => ({
      values: jest.fn((rawValues: Record<string, unknown>) => {
        if (table === schema.conversations) {
          const now = new Date();
          const row: ConvRow = {
            id: CONV_ID,
            orgId: ORG,
            agentId: AGENT_ID,
            workspaceChannelId: null,
            externalUserRef: null,
            externalThreadRef: null,
            title: null,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            ...(rawValues as Partial<ConvRow>),
          };
          conversations.push(row);
          return { returning: jest.fn(async () => [row]) };
        }
        return { returning: jest.fn(async () => []) };
      }),
    })),

    update: jest.fn((table: unknown) => {
      let setValues: Record<string, unknown> = {};
      return {
        set: jest.fn((values: Record<string, unknown>) => {
          setValues = values;
          return {
            where: jest.fn(async () => {
              if (table === schema.conversations && setValues.deletedAt) {
                for (const c of conversations) {
                  c.deletedAt = setValues.deletedAt as Date;
                }
              }
            }),
          };
        }),
      };
    }),

    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txInsert = jest.fn((table: unknown) => ({
        values: jest.fn(
          async (rawValues: Record<string, unknown> | Record<string, unknown>[]) => {
            if (table === schema.conversationMessages) {
              const rows = Array.isArray(rawValues) ? rawValues : [rawValues];
              for (const v of rows) {
                messages.push({
                  id: randomUUID(),
                  conversationId: (v.conversationId as string) ?? CONV_ID,
                  role: (v.role as string) ?? 'user',
                  content: (v.content as string) ?? '',
                  metadata: (v.metadata as Record<string, unknown>) ?? {},
                  createdAt: new Date(),
                });
              }
            }
          },
        ),
      }));
      const txUpdate = jest.fn((table: unknown) => {
        let txSetValues: Record<string, unknown> = {};
        return {
          set: jest.fn((values: Record<string, unknown>) => {
            txSetValues = values;
            return {
              where: jest.fn(async () => {
                if (table === schema.conversations && txSetValues.title) {
                  const conv = conversations[conversations.length - 1];
                  if (conv) conv.title = txSetValues.title as string;
                }
              }),
            };
          }),
        };
      });
      return fn({ insert: txInsert, update: txUpdate });
    }),
  } as unknown as DbClient;
}

/** Empty DB — every select returns [], used for 404/unknown-entity tests. */
function createEmptyDb(): DbClient {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({ where: jest.fn(() => makeQueryResult([])) })),
    })),
    insert: jest.fn(() => ({ values: jest.fn(async () => undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(async () => undefined) })) })),
  } as unknown as DbClient;
}

// ─── App builder ───────────────────────────────────────────────────────────────

const verifier: AuthTokenVerifier = {
  verifyToken: jest.fn(async () => ({
    user: { id: 'user_e2e', email: 'e2e@example.com', name: 'E2E User', avatarUrl: null },
    tenantId: ORG,
    permissions: ['agents:read', 'agents:write'],
  })),
};

async function buildApp(db: DbClient): Promise<{ app: INestApplication; baseUrl: string }> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      CoreModule.forRoot({ authProvider: 'dev' }),
      DrizzleModule.forRootAsync(),
      AgentsModule,
    ],
  })
    .overrideProvider(AUTH_TOKEN_VERIFIER)
    .useValue(verifier)
    .overrideProvider(DRIZZLE_CLIENT)
    .useValue(db)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address();
  if (!address || typeof address === 'string') throw new Error('Cannot resolve server address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { app, baseUrl };
}

function authFetch(baseUrl: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${TOKEN}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Conversations API (e2e)', () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key-placeholder';
  });

  describe('POST /api/agents/:id/conversations', () => {
    it('201 — creates a new conversation and returns id + createdAt', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      const res = await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; createdAt: string };
      expect(body).toEqual({
        id: expect.any(String),
        createdAt: expect.any(String),
      });

      await app.close();
    });

    it('404 — unknown agent returns 404', async () => {
      const { app, baseUrl } = await buildApp(createEmptyDb());

      const res = await authFetch(baseUrl, `/api/agents/${randomUUID()}/conversations`, {
        method: 'POST',
      });

      expect(res.status).toBe(404);
      await app.close();
    });

    it('401 — missing auth token', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      const res = await fetch(`${baseUrl}/api/agents/${AGENT_ID}/conversations`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      await app.close();
    });
  });

  describe('POST /api/agents/:id/conversations/:convId/chat', () => {
    it('201 — returns LLM response for a valid conversation', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      // Create conversation first
      await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`, { method: 'POST' });

      const res = await authFetch(
        baseUrl,
        `/api/agents/${AGENT_ID}/conversations/${CONV_ID}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Hello agent' }),
        },
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { content: string; usage: object };
      expect(body).toEqual({
        content: 'Hello from mock.',
        usage: expect.objectContaining({
          inputTokens: expect.any(Number),
          outputTokens: expect.any(Number),
        }),
      });

      await app.close();
    });

    it('400 — missing message field', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`, { method: 'POST' });

      const res = await authFetch(
        baseUrl,
        `/api/agents/${AGENT_ID}/conversations/${CONV_ID}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );

      expect(res.status).toBe(400);
      await app.close();
    });
  });

  describe('GET /api/agents/:id/conversations/:convId', () => {
    it('200 — returns conversation with persisted messages after chat', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      // Create + chat
      await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`, { method: 'POST' });
      await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations/${CONV_ID}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'What can you do?' }),
      });

      const res = await authFetch(
        baseUrl,
        `/api/agents/${AGENT_ID}/conversations/${CONV_ID}`,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        id: string;
        agentId: string;
        messages: { role: string; content: string }[];
      };
      expect(body.id).toBe(CONV_ID);
      expect(body.agentId).toBe(AGENT_ID);
      // Two messages should be persisted: user + assistant
      expect(body.messages.length).toBeGreaterThanOrEqual(2);
      expect(body.messages.find((m) => m.role === 'user')?.content).toBe('What can you do?');
      expect(body.messages.find((m) => m.role === 'assistant')?.content).toBe('Hello from mock.');

      await app.close();
    });
  });

  describe('GET /api/agents/:id/conversations', () => {
    it('200 — lists conversations for the agent', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`, { method: 'POST' });

      const res = await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`);

      expect(res.status).toBe(200);
      const list = (await res.json()) as { id: string }[];
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((c) => c.id === CONV_ID)).toBe(true);

      await app.close();
    });
  });

  describe('DELETE /api/agents/:id/conversations/:convId', () => {
    it('204 — soft-deletes conversation; subsequent GET returns 404', async () => {
      const { app, baseUrl } = await buildApp(createInMemoryDb());

      await authFetch(baseUrl, `/api/agents/${AGENT_ID}/conversations`, { method: 'POST' });

      const deleteRes = await authFetch(
        baseUrl,
        `/api/agents/${AGENT_ID}/conversations/${CONV_ID}`,
        { method: 'DELETE' },
      );

      expect(deleteRes.status).toBe(204);

      const getRes = await authFetch(
        baseUrl,
        `/api/agents/${AGENT_ID}/conversations/${CONV_ID}`,
      );

      expect(getRes.status).toBe(404);

      await app.close();
    });
  });
});
