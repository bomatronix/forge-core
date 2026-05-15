import { NotFoundException } from '@nestjs/common';
import type { DbClient } from '@forge-core/core';
import { KnowledgeService, type KnowledgeItem } from './knowledge.service';

const ORG = 'org_knowledge';
const AGENT_ID = '00000000-0000-4000-8000-000000000001';
const ITEM_ID = '00000000-0000-4000-8000-000000000010';

function knowledgeRow(overrides: Partial<KnowledgeItem> = {}): KnowledgeItem {
  const now = new Date('2026-05-14T00:00:00.000Z');
  return {
    id: ITEM_ID,
    orgId: ORG,
    agentId: AGENT_ID,
    type: 'qa',
    title: null,
    question: 'What is your return policy?',
    answer: '30-day returns',
    content: null,
    sourceUrl: null,
    knowledgeSourceOptionId: null,
    position: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createDbMock(
  options: {
    agentRows?: Array<{ id: string }>;
    itemRows?: KnowledgeItem[];
    insertRows?: KnowledgeItem[];
    updateRows?: KnowledgeItem[];
    deleteRows?: Array<{ id: string }>;
  } = {},
) {
  const agentWhere = jest.fn().mockResolvedValue(options.agentRows ?? [{ id: AGENT_ID }]);
  const itemOrderBy = jest.fn().mockResolvedValue(options.itemRows ?? [knowledgeRow()]);
  const itemWhere = jest.fn(() => ({ orderBy: itemOrderBy }));

  const selectAgentFrom = jest.fn(() => ({ where: agentWhere }));
  const selectItemsFrom = jest.fn(() => ({ where: itemWhere }));
  const select = jest.fn((selection?: unknown) => ({
    from: selection ? selectAgentFrom : selectItemsFrom,
  }));

  const insertReturning = jest.fn().mockResolvedValue(options.insertRows ?? [knowledgeRow()]);
  const insertValues = jest.fn(() => ({ returning: insertReturning }));
  const insert = jest.fn(() => ({ values: insertValues }));

  const updateReturning = jest.fn().mockResolvedValue(options.updateRows ?? [knowledgeRow()]);
  const updateWhere = jest.fn(() => ({ returning: updateReturning }));
  const updateSet = jest.fn(() => ({ where: updateWhere }));
  const update = jest.fn(() => ({ set: updateSet }));

  const deleteReturning = jest.fn().mockResolvedValue(options.deleteRows ?? [{ id: ITEM_ID }]);
  const deleteWhere = jest.fn(() => ({ returning: deleteReturning }));
  const del = jest.fn(() => ({ where: deleteWhere }));

  return {
    db: { select, insert, update, delete: del } as unknown as DbClient,
    agentWhere,
    itemWhere,
    itemOrderBy,
    insert,
    insertValues,
    updateSet,
    updateWhere,
    delete: del,
    deleteWhere,
  };
}

describe('KnowledgeService', () => {
  const knowledgeSourcesService = {
    findSelections: jest.fn().mockResolvedValue([]),
  };

  function createService(db: DbClient): KnowledgeService {
    return new KnowledgeService(db, knowledgeSourcesService as never);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    knowledgeSourcesService.findSelections.mockResolvedValue([]);
  });

  it('lists ordered knowledge items for an active tenant-owned agent', async () => {
    const rows = [
      knowledgeRow({ id: '00000000-0000-4000-8000-000000000011', position: 0 }),
      knowledgeRow({ id: '00000000-0000-4000-8000-000000000012', position: 1 }),
    ];
    const db = createDbMock({ itemRows: rows });
    const service = createService(db.db);

    await expect(service.findAll(ORG, AGENT_ID)).resolves.toEqual(rows);

    expect(db.agentWhere).toHaveBeenCalledTimes(1);
    expect(db.itemWhere).toHaveBeenCalledTimes(1);
    expect(db.itemOrderBy).toHaveBeenCalledTimes(1);
  });

  it('throws when the agent is missing or deleted', async () => {
    const db = createDbMock({ agentRows: [] });
    const service = createService(db.db);

    await expect(service.findAll(ORG, AGENT_ID)).rejects.toBeInstanceOf(NotFoundException);

    expect(db.itemWhere).not.toHaveBeenCalled();
  });

  it('returns prompt items linked to selected sources plus legacy unlinked items', async () => {
    const selectedSourceId = '00000000-0000-4000-8000-000000000020';
    const rows = [
      knowledgeRow({ id: '00000000-0000-4000-8000-000000000011', knowledgeSourceOptionId: null }),
      knowledgeRow({
        id: '00000000-0000-4000-8000-000000000012',
        knowledgeSourceOptionId: selectedSourceId,
      }),
      knowledgeRow({
        id: '00000000-0000-4000-8000-000000000013',
        knowledgeSourceOptionId: '00000000-0000-4000-8000-000000000021',
      }),
    ];
    knowledgeSourcesService.findSelections.mockResolvedValue([{ id: selectedSourceId }]);
    const db = createDbMock({ itemRows: rows });
    const service = createService(db.db);

    await expect(service.findPromptItems(ORG, AGENT_ID)).resolves.toEqual([rows[0], rows[1]]);
  });

  it('creates a tenant-scoped knowledge item after verifying ownership', async () => {
    const created = knowledgeRow({ type: 'document', title: 'Returns', content: '30 days' });
    const db = createDbMock({ insertRows: [created] });
    const service = createService(db.db);

    await expect(
      service.create(ORG, AGENT_ID, {
        type: 'document',
        title: 'Returns',
        content: '30 days',
      }),
    ).resolves.toEqual(created);

    expect(db.agentWhere).toHaveBeenCalledTimes(1);
    expect(db.insertValues).toHaveBeenCalledWith({
      orgId: ORG,
      agentId: AGENT_ID,
      type: 'document',
      title: 'Returns',
      question: null,
      answer: null,
      content: '30 days',
      sourceUrl: null,
      knowledgeSourceOptionId: null,
      position: 0,
    });
  });

  it('does not create when the agent is missing or deleted', async () => {
    const db = createDbMock({ agentRows: [] });
    const service = createService(db.db);

    await expect(
      service.create(ORG, AGENT_ID, { type: 'qa', question: 'Q', answer: 'A' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(db.insert).not.toHaveBeenCalled();
  });

  it('updates an org and agent scoped knowledge item', async () => {
    const updated = knowledgeRow({ answer: '45-day returns', position: 2 });
    const db = createDbMock({ updateRows: [updated] });
    const service = createService(db.db);

    await expect(
      service.update(ORG, AGENT_ID, ITEM_ID, { answer: '45-day returns', position: 2 }),
    ).resolves.toEqual(updated);

    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: '45-day returns',
        position: 2,
        updatedAt: expect.any(Date),
      }),
    );
    expect(db.updateWhere).toHaveBeenCalledTimes(1);
  });

  it('throws when updating a missing knowledge item', async () => {
    const db = createDbMock({ updateRows: [] });
    const service = createService(db.db);

    await expect(service.update(ORG, AGENT_ID, ITEM_ID, { answer: 'A' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes an org and agent scoped knowledge item', async () => {
    const db = createDbMock();
    const service = createService(db.db);

    await expect(service.remove(ORG, AGENT_ID, ITEM_ID)).resolves.toBeUndefined();

    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('throws when deleting a missing knowledge item', async () => {
    const db = createDbMock({ deleteRows: [] });
    const service = createService(db.db);

    await expect(service.remove(ORG, AGENT_ID, ITEM_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
