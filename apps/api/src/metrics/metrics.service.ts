import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import type { DashboardMetrics } from '@forge-core/common';

function numericValue(row: { value: unknown } | undefined): number {
  const value = row?.value ?? 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

@Injectable()
export class MetricsService {
  constructor(@Inject(DRIZZLE_CLIENT) private db: DbClient) {}

  async getDashboardMetrics(orgId: string): Promise<DashboardMetrics> {
    const [totalAgentRow] = await this.db
      .select({ value: count() })
      .from(schema.agents)
      .where(and(eq(schema.agents.orgId, orgId), isNull(schema.agents.deletedAt)));

    const [activeAgentRow] = await this.db
      .select({ value: count() })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.orgId, orgId),
          eq(schema.agents.status, 'live'),
          isNull(schema.agents.deletedAt),
        ),
      );

    const [messageRow] = await this.db
      .select({
        value: sql<number>`coalesce(sum(${schema.agentUsageEvents.messageCount}), 0)`,
      })
      .from(schema.agentUsageEvents)
      .where(
        and(
          eq(schema.agentUsageEvents.orgId, orgId),
          eq(schema.agentUsageEvents.eventType, 'chat_message'),
        ),
      );

    return {
      totalAgents: numericValue(totalAgentRow),
      activeAgents: numericValue(activeAgentRow),
      totalMessages: numericValue(messageRow),
      period: 'all-time',
    };
  }
}
