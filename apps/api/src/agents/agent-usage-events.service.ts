import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';

export type AgentUsageSource = 'public' | 'builder_test';

interface RecordChatMessageInput {
  orgId: string;
  agentId: string;
  source: AgentUsageSource;
  messageCount?: number;
  inputTokens?: number;
  outputTokens?: number;
}

@Injectable()
export class AgentUsageEventsService {
  private readonly logger = new Logger(AgentUsageEventsService.name);

  constructor(@Inject(DRIZZLE_CLIENT) private db: DbClient) {}

  async recordChatMessage({
    orgId,
    agentId,
    source,
    messageCount = 1,
    inputTokens = 0,
    outputTokens = 0,
  }: RecordChatMessageInput): Promise<void> {
    await this.db.insert(schema.agentUsageEvents).values({
      orgId,
      agentId,
      source,
      eventType: 'chat_message',
      messageCount,
      inputTokens,
      outputTokens,
    });
  }

  logRecordFailure(agentId: string, err: unknown): void {
    this.logger.warn(
      `[usage] failed to record chat usage for agent=${agentId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
