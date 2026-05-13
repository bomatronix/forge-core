import type { DbClient } from '@forge-core/core';
import { AgentUsageEventsService } from './agent-usage-events.service';

function createDbMock() {
  const insertValues = jest.fn();
  const insert = jest.fn(() => ({ values: insertValues }));

  return {
    db: { insert } as unknown as DbClient,
    insert,
    insertValues,
  };
}

describe('AgentUsageEventsService', () => {
  it('records a chat message usage event without transcript content', async () => {
    const db = createDbMock();
    const service = new AgentUsageEventsService(db.db);

    await service.recordChatMessage({
      orgId: 'org_123',
      agentId: '3a905a21-676d-4d72-9731-61e1f7fd0387',
      source: 'public',
      inputTokens: 10,
      outputTokens: 5,
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insertValues).toHaveBeenCalledWith({
      orgId: 'org_123',
      agentId: '3a905a21-676d-4d72-9731-61e1f7fd0387',
      source: 'public',
      eventType: 'chat_message',
      messageCount: 1,
      inputTokens: 10,
      outputTokens: 5,
    });
  });
});
