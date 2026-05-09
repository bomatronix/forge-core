/**
 * Live integration test — calls the real Anthropic API.
 * Skipped automatically in CI (CI=true) or when ANTHROPIC_API_KEY is not set.
 * Run locally: npx jest chat.live.e2e.spec.ts --no-coverage --forceExit
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
  type AuthTokenVerifier,
  type DbClient,
} from '@forge-core/core';
import { AgentsModule } from '../agents.module';

const itLive = process.env.CI || !process.env.ANTHROPIC_API_KEY ? it.skip : it;

const ORG = 'org_live_e2e';
const TOKEN = 'live-test-token';
const AGENT_ID = randomUUID();

const testAgent = {
  id: AGENT_ID,
  orgId: ORG,
  workspaceId: null,
  name: 'Aria',
  status: 'live',
  templateId: null,
  uiConfig: {
    identity: { tone: 'friendly', welcomeMessage: 'Hi! How can I help?' },
    behaviour: { systemPrompt: 'You are a concise assistant. Keep answers under 20 words.' },
    channels: ['Web'],
  },
  aiConfig: null,
  shareToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

async function buildApp(): Promise<{ app: INestApplication; baseUrl: string }> {
  const db: DbClient = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => [testAgent]),
      })),
    })),
  } as unknown as DbClient;

  const verifier: AuthTokenVerifier = {
    verifyToken: jest.fn(async () => ({
      user: { id: 'user_live', email: 'live@example.com', name: 'Live User', avatarUrl: null },
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
    .useValue(db)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address();
  if (!address || typeof address === 'string') throw new Error('Cannot resolve server address');

  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('Chat API — live Anthropic integration', () => {
  itLive(
    'returns a real Claude response that mentions the agent name',
    async () => {
      const { app, baseUrl } = await buildApp();

      const res = await fetch(`${baseUrl}/api/agents/${AGENT_ID}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'What is your name?' }] }),
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        content: string;
        usage: { inputTokens: number; outputTokens: number };
      };

      expect(typeof body.content).toBe('string');
      expect(body.content.length).toBeGreaterThan(0);
      expect(body.usage.inputTokens).toBeGreaterThan(0);
      expect(body.usage.outputTokens).toBeGreaterThan(0);

      // The system prompt says "You are Aria" — Claude should mention the name
      expect(body.content.toLowerCase()).toContain('aria');

      await app.close();
    },
    15_000, // 15s timeout for real API call
  );

  itLive(
    'streams real Claude response with delta events ending in done',
    async () => {
      const { app, baseUrl } = await buildApp();

      const res = await fetch(`${baseUrl}/api/agents/${AGENT_ID}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'What is your name?' }] }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const text = await res.text();
      const events = text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)) as { type: string; content?: string });

      const deltas = events.filter((e) => e.type === 'delta');
      const combined = deltas.map((e) => e.content ?? '').join('');

      expect(deltas.length).toBeGreaterThan(0);
      expect(combined.length).toBeGreaterThan(0);
      // System prompt says "You are Aria" — Claude should mention the name
      expect(combined.toLowerCase()).toContain('aria');
      expect(events[events.length - 1]).toEqual({ type: 'done' });

      await app.close();
    },
    20_000, // 20s timeout for streaming
  );
});
