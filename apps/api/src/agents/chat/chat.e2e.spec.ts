import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import {
  AUTH_TOKEN_VERIFIER,
  CoreModule,
  DRIZZLE_CLIENT,
  DrizzleModule,
  type AuthTokenVerifier,
  type DbClient,
} from '@forge-core/core';
import { AgentsModule } from '../agents.module';

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'I am Test Agent.' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      stream: jest.fn().mockImplementation(() => {
        async function* gen() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'I am ' } };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Test Agent.' } };
          yield { type: 'message_start', message: {} }; // non-text event — should be skipped
        }
        return gen();
      }),
    },
  })),
}));

const ORG = 'org_chat_e2e';
const TOKEN = 'test-token';
const AGENT_ID = randomUUID();

type AgentRow = {
  id: string;
  orgId: string;
  workspaceId: string | null;
  name: string;
  status: string;
  templateId: string | null;
  uiConfig: Record<string, unknown> | null;
  aiConfig: Record<string, unknown> | null;
  shareToken: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

const testAgent: AgentRow = {
  id: AGENT_ID,
  orgId: ORG,
  workspaceId: null,
  name: 'Test Agent',
  status: 'live',
  templateId: null,
  uiConfig: {
    identity: { tone: 'friendly', welcomeMessage: 'Hello!' },
    behaviour: { systemPrompt: 'Help users with their questions.' },
    channels: ['Web'],
  },
  aiConfig: null,
  shareToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

function createDbWithAgent(agent: AgentRow): DbClient {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => [agent]),
      })),
    })),
  } as unknown as DbClient;
}

function createEmptyDb(): DbClient {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => []),
      })),
    })),
  } as unknown as DbClient;
}

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

async function collectSseEvents(res: Response): Promise<unknown[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as unknown);
}

describe('Chat API (e2e)', () => {
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'test-key-placeholder';
  });

  describe('POST /api/agents/:id/chat', () => {
    it('200 — returns Claude response for a valid agent', async () => {
      const { app, baseUrl } = await buildApp(createDbWithAgent(testAgent));

      const res = await authFetch(baseUrl, `/api/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi, who are you?' }] }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { content: string; usage: { inputTokens: number; outputTokens: number } };
      expect(body).toEqual({
        content: 'I am Test Agent.',
        usage: { inputTokens: 10, outputTokens: 5 },
      });

      await app.close();
    });

    it('404 — agent not found', async () => {
      const { app, baseUrl } = await buildApp(createEmptyDb());

      const res = await authFetch(baseUrl, `/api/agents/unknown-id/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      expect(res.status).toBe(404);
      await app.close();
    });

    it('401 — missing auth token', async () => {
      const { app, baseUrl } = await buildApp(createDbWithAgent(testAgent));

      const res = await fetch(`${baseUrl}/api/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      expect(res.status).toBe(401);
      await app.close();
    });

    it('400 — invalid request body (messages not an array)', async () => {
      const { app, baseUrl } = await buildApp(createDbWithAgent(testAgent));

      const res = await authFetch(baseUrl, `/api/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: 'not-an-array' }),
      });

      expect(res.status).toBe(400);
      await app.close();
    });
  });

  describe('POST /api/agents/:id/chat/stream', () => {
    it('200 — streams delta events and done for a valid agent', async () => {
      const { app, baseUrl } = await buildApp(createDbWithAgent(testAgent));

      const res = await authFetch(baseUrl, `/api/agents/${AGENT_ID}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const events = await collectSseEvents(res);
      expect(events).toContainEqual({ type: 'delta', content: 'I am ' });
      expect(events).toContainEqual({ type: 'delta', content: 'Test Agent.' });
      expect(events[events.length - 1]).toEqual({ type: 'done' });

      await app.close();
    });

    it('404 — agent not found', async () => {
      const { app, baseUrl } = await buildApp(createEmptyDb());

      const res = await authFetch(baseUrl, `/api/agents/unknown-id/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      expect(res.status).toBe(404);
      await app.close();
    });

    it('401 — missing auth token', async () => {
      const { app, baseUrl } = await buildApp(createDbWithAgent(testAgent));

      const res = await fetch(`${baseUrl}/api/agents/${AGENT_ID}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      expect(res.status).toBe(401);
      await app.close();
    });

    it('400 — invalid request body (messages not an array)', async () => {
      const { app, baseUrl } = await buildApp(createDbWithAgent(testAgent));

      const res = await authFetch(baseUrl, `/api/agents/${AGENT_ID}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: 'not-an-array' }),
      });

      expect(res.status).toBe(400);
      await app.close();
    });
  });
});
