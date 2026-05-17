import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import {
  AUTH_TOKEN_VERIFIER,
  CoreModule,
  DRIZZLE_CLIENT,
  DrizzleModule,
  type AuthTokenVerifier,
  type DbClient,
} from '@forge-core/core';
import { MetricsModule } from './metrics.module';

const ORG = 'org_metrics_e2e';
const TOKEN = 'test-token';

function createMetricsDb(): DbClient {
  const where = jest
    .fn()
    .mockResolvedValueOnce([{ value: 3 }])
    .mockResolvedValueOnce([{ value: 2 }])
    .mockResolvedValueOnce([{ value: 5 }]);
  const from = jest.fn(() => ({ where }));
  const select = jest.fn(() => ({ from }));

  return { select } as unknown as DbClient;
}

const verifier: AuthTokenVerifier = {
  verifyToken: jest.fn(async () => ({
    user: {
      id: 'user_metrics',
      email: 'metrics@example.com',
      name: 'Metrics User',
      avatarUrl: null,
    },
    tenantId: ORG,
    permissions: ['agents:read'],
  })),
};

async function buildApp(db: DbClient): Promise<{ app: INestApplication; baseUrl: string }> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      CoreModule.forRoot({ authProvider: 'dev' }),
      DrizzleModule.forRootAsync(),
      MetricsModule,
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

describe('Metrics API (e2e)', () => {
  it('200 — returns authenticated tenant metrics', async () => {
    const { app, baseUrl } = await buildApp(createMetricsDb());

    const res = await fetch(`${baseUrl}/api/metrics`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      totalAgents: 3,
      activeAgents: 2,
      totalMessages: 5,
      period: 'all-time',
    });

    await app.close();
  });

  it('401 — rejects unauthenticated metrics requests', async () => {
    const { app, baseUrl } = await buildApp(createMetricsDb());

    const res = await fetch(`${baseUrl}/api/metrics`);

    expect(res.status).toBe(401);
    await app.close();
  });
});
