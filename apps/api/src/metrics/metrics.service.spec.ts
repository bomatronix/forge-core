import type { DbClient } from '@forge-core/core';
import { MetricsService } from './metrics.service';

function createDbMock(results: Array<Array<{ value: number | string }>>) {
  const where = jest
    .fn()
    .mockResolvedValueOnce(results[0] ?? [])
    .mockResolvedValueOnce(results[1] ?? [])
    .mockResolvedValueOnce(results[2] ?? []);
  const from = jest.fn(() => ({ where }));
  const select = jest.fn(() => ({ from }));

  return {
    db: { select } as unknown as DbClient,
    select,
    from,
    where,
  };
}

describe('MetricsService', () => {
  it('returns tenant dashboard metrics from agent and usage counts', async () => {
    const db = createDbMock([[{ value: 3 }], [{ value: 2 }], [{ value: 5 }]]);
    const service = new MetricsService(db.db);

    await expect(service.getDashboardMetrics('org_metrics')).resolves.toEqual({
      totalAgents: 3,
      activeAgents: 2,
      totalMessages: 5,
      period: 'all-time',
    });

    expect(db.select).toHaveBeenCalledTimes(3);
    expect(db.from).toHaveBeenCalledTimes(3);
    expect(db.where).toHaveBeenCalledTimes(3);
  });

  it('normalizes aggregate strings and empty sums to numbers', async () => {
    const db = createDbMock([[{ value: '4' }], [{ value: '1' }], [{ value: '0' }]]);
    const service = new MetricsService(db.db);

    await expect(service.getDashboardMetrics('org_metrics')).resolves.toMatchObject({
      totalAgents: 4,
      activeAgents: 1,
      totalMessages: 0,
    });
  });
});
