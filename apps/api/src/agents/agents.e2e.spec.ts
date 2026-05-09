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
import { AgentsModule } from './agents.module';
import { ChatService } from './chat/chat.service';

const ORG = 'org_e2e';
const TOKEN = 'test-token';

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

function createInMemoryDb(rows: AgentRow[]): DbClient {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => rows.filter((row) => row.orgId === ORG && !row.deletedAt)),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((values: Partial<AgentRow>) => ({
        returning: jest.fn(async () => {
          const now = new Date();
          const row: AgentRow = {
            id: randomUUID(),
            orgId: values.orgId ?? ORG,
            workspaceId: null,
            name: values.name ?? 'Untitled Agent',
            status: 'draft',
            templateId: values.templateId ?? null,
            uiConfig: values.uiConfig ?? null,
            aiConfig: values.aiConfig ?? null,
            shareToken: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          };
          rows.push(row);
          return [row];
        }),
      })),
    })),
  } as unknown as DbClient;
}

describe('Agents API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    const rows: AgentRow[] = [];
    const verifier: AuthTokenVerifier = {
      verifyToken: jest.fn(async () => ({
        user: {
          id: 'user_e2e',
          email: 'e2e@example.com',
          name: 'E2E User',
          avatarUrl: null,
        },
        tenantId: ORG,
        permissions: ['agents:read', 'agents:write'],
      })),
    };

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
      .useValue(createInMemoryDb(rows))
      .overrideProvider(ChatService)
      .useValue({ onModuleInit: jest.fn(), chat: jest.fn(), buildSystemPrompt: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);

    const address = (app.getHttpServer() as Server).address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve e2e server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${TOKEN}`);

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  }

  it('POST /api/agents then GET /api/agents returns the created agent', async () => {
    const createResponse = await api('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Agent',
        uiConfig: { channels: ['Web'] },
      }),
    });

    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as AgentRow;
    expect(created).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        orgId: ORG,
        name: 'E2E Agent',
        status: 'draft',
      }),
    );

    const listResponse = await api('/api/agents');

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual([
      expect.objectContaining({
        id: created.id,
        name: 'E2E Agent',
        status: 'draft',
        channels: ['Web'],
      }),
    ]);
  });
});
