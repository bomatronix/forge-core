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
import { AppChannelsModule } from './channels.module';
import { ChatService } from '../agents/chat/chat.service';
import { AgentUsageEventsService } from '../agents/agent-usage-events.service';
import { KnowledgeService } from '../agents/knowledge/knowledge.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const ORG = 'org_ch_e2e';
const TOKEN = 'test-token';

// ─── Row types ────────────────────────────────────────────────────────────────

type ChannelDbRow = typeof schema.workspaceChannels.$inferSelect;
type RuleDbRow = typeof schema.channelRoutingRules.$inferSelect;
type AgentDbRow = typeof schema.agents.$inferSelect;
type ConvDbRow = typeof schema.conversations.$inferSelect;
type MsgDbRow = typeof schema.conversationMessages.$inferSelect;

// ─── In-memory DB factory ─────────────────────────────────────────────────────

/**
 * Builds a Drizzle-compatible mock that routes to different in-memory stores
 * based on the table passed to `from()`.
 */
function createChannelsDb(
  channelRows: ChannelDbRow[],
  ruleRows: RuleDbRow[],
  agentRows: AgentDbRow[],
  convRows: ConvDbRow[],
  msgRows: MsgDbRow[],
): DbClient {
  type AnyRow = ChannelDbRow | RuleDbRow | AgentDbRow | ConvDbRow | MsgDbRow;

  function rowsFor(table: unknown): AnyRow[] {
    if (table === schema.workspaceChannels) return channelRows as AnyRow[];
    if (table === schema.channelRoutingRules) return ruleRows as AnyRow[];
    if (table === schema.agents) return agentRows as AnyRow[];
    if (table === schema.conversations) return convRows as AnyRow[];
    if (table === schema.conversationMessages) return msgRows as AnyRow[];
    return [];
  }

  return {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => {
        const rows = rowsFor(table);
        return {
          // Plain .where() — used for single-row lookups
          where: jest.fn(() => ({
            orderBy: jest.fn().mockResolvedValue(rows),
            limit: jest.fn().mockResolvedValue(rows),
            mockResolvedValue: undefined,
            then: (resolve: (v: AnyRow[]) => void) => resolve(rows),
          })),
          // .orderBy() without .where() — used in findAll style
          orderBy: jest.fn().mockResolvedValue(rows),
          // .limit() without .where()
          limit: jest.fn().mockResolvedValue(rows),
        };
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((vals: Partial<AnyRow> | Partial<AnyRow>[]) => {
        // Normalize to array so both single-object and array inserts work.
        // saveMessages() passes [userMsg, assistantMsg] — the old single-object
        // mock silently dropped those because the type guards failed on an array.
        const items: Partial<AnyRow>[] = Array.isArray(vals) ? vals : [vals];

        let executed = false;
        const execute = async (): Promise<AnyRow[]> => {
          if (executed) return [];
          executed = true;
          const results: AnyRow[] = [];
          const now = new Date();
          for (const item of items) {
            const newRow = { id: randomUUID(), createdAt: now, updatedAt: now, ...item } as AnyRow;
            if ('channelType' in item) {
              const row = newRow as ChannelDbRow;
              if (!(row as Partial<ChannelDbRow>).status)
                (row as Partial<ChannelDbRow>).status = 'active';
              channelRows.push(row);
            } else if (
              'workspaceChannelId' in item &&
              !('agentId' in item && 'externalUserRef' in item)
            ) {
              ruleRows.push(newRow as RuleDbRow);
            } else if ('agentId' in item && 'externalUserRef' in item) {
              convRows.push(newRow as ConvDbRow);
            } else if ('role' in item) {
              msgRows.push(newRow as MsgDbRow);
            }
            results.push(newRow);
          }
          return results;
        };

        type InsertBuilder = {
          returning: jest.Mock;
          onConflictDoNothing: jest.Mock<InsertBuilder>;
          then: (resolve: (v: AnyRow[]) => void, reject: (e: unknown) => void) => void;
        };
        const builder: InsertBuilder = {
          returning: jest.fn(execute),
          onConflictDoNothing: jest.fn(() => builder),
          // Make the result directly awaitable (no .returning() call needed)
          then: (resolve: (v: AnyRow[]) => void, reject: (e: unknown) => void) => {
            void execute().then(resolve, reject);
          },
        };
        return builder;
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn((updates: Partial<AnyRow>) => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => {
            // Find and mutate first match in channels (simplified for e2e)
            const idx = channelRows.findIndex((r) => r.id === (updates as { id?: string }).id);
            if (idx !== -1) {
              channelRows[idx] = { ...channelRows[idx], ...updates };
              return [channelRows[idx]];
            }
            // Return updates merged with first row as fallback
            if (channelRows.length > 0) {
              return [{ ...channelRows[0], ...updates }];
            }
            return [];
          }),
        })),
      })),
    })),
    delete: jest.fn(() => ({
      where: jest.fn().mockResolvedValue(undefined),
    })),
  } as unknown as DbClient;
}

function channelRow(overrides: Partial<ChannelDbRow> = {}): ChannelDbRow {
  const now = new Date();
  return {
    id: randomUUID(),
    orgId: ORG,
    channelType: 'test',
    name: 'E2E Test Channel',
    config: {},
    webhookSecret: null,
    status: 'active',
    workspaceInstructions: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as ChannelDbRow;
}

function agentRow(): AgentDbRow {
  const now = new Date();
  return {
    id: 'agent_e2e_1',
    orgId: ORG,
    workspaceId: null,
    name: 'E2E Agent',
    status: 'live',
    templateId: null,
    agentTypeSlug: 'support',
    uiConfig: {
      identity: { tone: 'friendly', welcomeMessage: 'Hello!' },
      behaviour: { systemPrompt: 'Be helpful.' },
      channels: ['test'],
    },
    aiConfig: null,
    shareToken: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  } as AgentDbRow;
}

// ─── Auth verifier ────────────────────────────────────────────────────────────

const verifier: AuthTokenVerifier = {
  verifyToken: jest.fn().mockResolvedValue({
    user: { id: 'user_e2e', email: 'e2e@test.com', name: 'E2E User', avatarUrl: null },
    tenantId: ORG,
    permissions: ['agents:read', 'agents:write'],
  }),
};

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildApp(
  channelRows: ChannelDbRow[],
  ruleRows: RuleDbRow[],
  agentRows: AgentDbRow[] = [],
  convRows: ConvDbRow[] = [],
  msgRows: MsgDbRow[] = [],
): Promise<{ app: INestApplication; baseUrl: string }> {
  const db = createChannelsDb(channelRows, ruleRows, agentRows, convRows, msgRows);

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      CoreModule.forRoot({ authProvider: 'dev' }),
      DrizzleModule.forRootAsync(),
      AppChannelsModule,
    ],
  })
    .overrideProvider(AUTH_TOKEN_VERIFIER)
    .useValue(verifier)
    .overrideProvider(DRIZZLE_CLIENT)
    .useValue(db)
    .overrideProvider(ChatService)
    .useValue({
      onModuleInit: jest.fn(),
      chat: jest.fn(),
      buildSystemPrompt: jest.fn().mockReturnValue('You are E2E Agent. Be helpful.'),
      chatWithSystem: jest.fn().mockResolvedValue({
        content: 'Mock reply from E2E Agent',
        usage: { inputTokens: 10, outputTokens: 20 },
      }),
    })
    .overrideProvider(KnowledgeService)
    .useValue({ findPromptItems: jest.fn().mockResolvedValue([]) })
    .overrideProvider(AgentUsageEventsService)
    .useValue({
      recordChatMessage: jest.fn().mockResolvedValue(undefined),
      logRecordFailure: jest.fn(),
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve e2e server address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { app, baseUrl };
}

function api(baseUrl: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${TOKEN}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Channels API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const channels: ChannelDbRow[] = [];
  const rules: RuleDbRow[] = [];
  const agents: AgentDbRow[] = [agentRow()];
  const convRows: ConvDbRow[] = [];
  const msgRows: MsgDbRow[] = [];

  beforeEach(async () => {
    jest.clearAllMocks();
    channels.length = 0;
    rules.length = 0;
    convRows.length = 0;
    msgRows.length = 0;
    ({ app, baseUrl } = await buildApp(channels, rules, agents, convRows, msgRows));
  });

  afterEach(async () => {
    await app.close();
  });

  // ── C1: GET /api/channels/catalog ──────────────────────────────────────────

  it('C1: GET /api/channels/catalog returns 200 with channel type list', async () => {
    const res = await api(baseUrl, '/api/channels/catalog');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string }[];
    expect(Array.isArray(body)).toBe(true);
    const types = body.map((c) => c.type);
    expect(types).toContain('test');
    expect(types).toContain('webhook');
  });

  // ── C2: POST /api/channels creates a channel ───────────────────────────────

  it('C2: POST /api/channels creates and returns a channel', async () => {
    const res = await api(baseUrl, '/api/channels', {
      method: 'POST',
      body: JSON.stringify({ channelType: 'test', name: 'E2E Test' }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      channelType: string;
      name: string;
      status: string;
    };
    expect(body).toMatchObject({
      id: expect.any(String),
      channelType: 'test',
      name: 'E2E Test',
      status: 'active',
    });
  });

  // ── C3: GET /api/channels returns list ────────────────────────────────────

  it('C3: GET /api/channels returns all org channels', async () => {
    // Seed a channel directly
    channels.push(channelRow({ name: 'Seeded Channel' }));

    const res = await api(baseUrl, '/api/channels');

    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((c) => c.name === 'Seeded Channel')).toBe(true);
  });

  // ── C4: GET /api/channels/:id returns specific channel ────────────────────

  it('C4: GET /api/channels/:id returns a specific channel', async () => {
    const ch = channelRow({ name: 'Specific Channel' });
    channels.push(ch);

    const res = await api(baseUrl, `/api/channels/${ch.id}`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe(ch.id);
    expect(body.name).toBe('Specific Channel');
  });

  // ── C5: PATCH /api/channels/:id updates channel ───────────────────────────

  it('C5: PATCH /api/channels/:id returns updated channel', async () => {
    const ch = channelRow({ name: 'Original Name' });
    channels.push(ch);

    const res = await api(baseUrl, `/api/channels/${ch.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe('Updated Name');
  });

  // ── C6: POST routing-rules creates a rule ────────────────────────────────

  it('C6: POST /api/channels/:id/routing-rules creates a routing rule', async () => {
    const ch = channelRow();
    channels.push(ch);

    const res = await api(baseUrl, `/api/channels/${ch.id}/routing-rules`, {
      method: 'POST',
      body: JSON.stringify({
        conditionType: 'always',
        agentId: 'agent_e2e_1',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; conditionType: string; agentId: string };
    expect(body).toMatchObject({
      id: expect.any(String),
      conditionType: 'always',
      agentId: 'agent_e2e_1',
    });
  });

  // ── C7: GET routing-rules returns list ───────────────────────────────────

  it('C7: GET /api/channels/:id/routing-rules returns rules', async () => {
    const ch = channelRow();
    channels.push(ch);
    const rule = {
      id: randomUUID(),
      workspaceChannelId: ch.id,
      orgId: ORG,
      priority: 0,
      conditionType: 'always',
      conditionValue: {},
      agentId: 'agent_e2e_1',
      agentInstructions: null,
      createdAt: new Date(),
    } as RuleDbRow;
    rules.push(rule);

    const res = await api(baseUrl, `/api/channels/${ch.id}/routing-rules`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(Array.isArray(body)).toBe(true);
  });

  // ── C8: GET webhook-url returns URL ───────────────────────────────────────

  it('C8: GET /api/channels/:id/webhook-url returns webhook URL string', async () => {
    const ch = channelRow();
    channels.push(ch);

    const res = await api(baseUrl, `/api/channels/${ch.id}/webhook-url`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { webhookUrl: string };
    expect(typeof body.webhookUrl).toBe('string');
    expect(body.webhookUrl).toContain(ch.id);
  });

  // ── C9: POST test trigger returns ok + reply ──────────────────────────────

  it('C9: POST /api/channels/test/:id/trigger returns AI reply for test channel', async () => {
    const ch = channelRow({ channelType: 'test', status: 'active' });
    channels.push(ch);

    const rule = {
      id: randomUUID(),
      workspaceChannelId: ch.id,
      orgId: ORG,
      priority: 0,
      conditionType: 'always',
      conditionValue: {},
      agentId: 'agent_e2e_1',
      agentInstructions: null,
      createdAt: new Date(),
    } as RuleDbRow;
    rules.push(rule);

    const res = await api(baseUrl, `/api/channels/test/${ch.id}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello from e2e' }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; reply?: string; conversationId?: string };
    expect(body.ok).toBe(true);
    expect(body.reply).toBe('Mock reply from E2E Agent');
    expect(typeof body.conversationId).toBe('string');

    // ── Persistence assertions ──────────────────────────────────────────────
    // A conversation row must have been inserted by ChannelConversationService.findOrCreate
    expect(convRows).toHaveLength(1);
    expect(convRows[0]).toMatchObject({
      agentId: 'agent_e2e_1',
      workspaceChannelId: ch.id,
      externalUserRef: 'test-user',
    });

    // Both turns (user + assistant) must be persisted by ChannelConversationService.saveMessages
    expect(msgRows).toHaveLength(2);
    expect(msgRows.find((m) => (m as unknown as { role: string }).role === 'user')).toBeDefined();
    expect(
      msgRows.find((m) => (m as unknown as { role: string }).role === 'assistant'),
    ).toBeDefined();
    const userMsg = msgRows.find(
      (m) => (m as unknown as { role: string }).role === 'user',
    ) as unknown as { content: string };
    const botMsg = msgRows.find(
      (m) => (m as unknown as { role: string }).role === 'assistant',
    ) as unknown as { content: string };
    expect(userMsg.content).toBe('Hello from e2e');
    expect(botMsg.content).toBe('Mock reply from E2E Agent');
  });

  // ── C10: Test trigger on non-test channel returns 400 ────────────────────

  it('C10: POST /api/channels/test/:id/trigger on webhook channel returns 400', async () => {
    const ch = channelRow({ channelType: 'webhook' });
    channels.push(ch);

    const res = await api(baseUrl, `/api/channels/test/${ch.id}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ text: 'oops' }),
    });

    expect(res.status).toBe(400);
  });

  // ── C11: Public webhook endpoint always returns 200 ──────────────────────

  it('C11: POST /api/public/webhook/:id always returns 200', async () => {
    const ch = channelRow({ channelType: 'test', status: 'active' });
    channels.push(ch);

    // No auth header — this is a public endpoint
    const res = await fetch(`${baseUrl}/api/public/webhook/${ch.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ping' }),
    });

    expect(res.status).toBe(200);
  });

  // ── C12: DELETE routing rule returns 204 ─────────────────────────────────

  it('C12: DELETE /api/channels/:id/routing-rules/:ruleId returns 204', async () => {
    const ch = channelRow();
    channels.push(ch);
    const rule = {
      id: 'rule_to_delete',
      workspaceChannelId: ch.id,
      orgId: ORG,
      priority: 0,
      conditionType: 'always',
      conditionValue: {},
      agentId: 'agent_e2e_1',
      agentInstructions: null,
      createdAt: new Date(),
    } as RuleDbRow;
    rules.push(rule);

    const res = await api(baseUrl, `/api/channels/${ch.id}/routing-rules/${rule.id}`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(204);
  });

  // ── C13: DELETE channel returns 204 ──────────────────────────────────────

  it('C13: DELETE /api/channels/:id returns 204', async () => {
    const ch = channelRow();
    channels.push(ch);

    const res = await api(baseUrl, `/api/channels/${ch.id}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
  });

  // ── C14: Unauthenticated request returns 401 ─────────────────────────────

  it('C14: GET /api/channels without auth returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/channels`);
    expect(res.status).toBe(401);
  });
});
