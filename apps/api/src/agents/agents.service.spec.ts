import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { DbClient } from '@forge-core/core';
import { AgentsService } from './agents.service';

const ORG = 'org_test123';
const AGENT_ID = 'agent_abc';

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

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: AGENT_ID,
    orgId: ORG,
    workspaceId: null,
    name: 'Test Agent',
    status: 'draft',
    templateId: null,
    uiConfig: { channels: ['Web'] },
    aiConfig: null,
    shareToken: null,
    createdAt: new Date('2026-05-07T00:00:00.000Z'),
    updatedAt: new Date('2026-05-07T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function createDbMock() {
  const selectWhere = jest.fn();
  const selectFrom = jest.fn(() => ({ where: selectWhere }));
  const select = jest.fn(() => ({ from: selectFrom }));

  const insertReturning = jest.fn();
  const insertValues = jest.fn(() => ({ returning: insertReturning }));
  const insert = jest.fn(() => ({ values: insertValues }));

  const updateReturning = jest.fn();
  const updateWhere = jest.fn(() => ({ returning: updateReturning }));
  const updateSet = jest.fn(() => ({ where: updateWhere }));
  const update = jest.fn(() => ({ set: updateSet }));

  return {
    db: { select, insert, update } as unknown as DbClient,
    select,
    selectFrom,
    selectWhere,
    insert,
    insertValues,
    insertReturning,
    update,
    updateSet,
    updateWhere,
    updateReturning,
  };
}

describe('AgentsService', () => {
  let db: ReturnType<typeof createDbMock>;
  let service: AgentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createDbMock();
    service = new AgentsService(db.db);
  });

  describe('list()', () => {
    it('queries active tenant agents and maps rows to dashboard agents', async () => {
      db.selectWhere.mockResolvedValue([agentRow()]);

      await expect(service.list(ORG)).resolves.toEqual([
        {
          id: AGENT_ID,
          name: 'Test Agent',
          status: 'draft',
          channels: ['Web'],
          conversations: 0,
          resolution: null,
          csat: null,
        },
      ]);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(db.selectFrom).toHaveBeenCalledTimes(1);
      expect(db.selectWhere).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne()', () => {
    it('returns an org-scoped agent row', async () => {
      const row = agentRow();
      db.selectWhere.mockResolvedValue([row]);

      await expect(service.findOne(ORG, AGENT_ID)).resolves.toEqual(row);
    });

    it('throws when the agent is missing or not owned by the org', async () => {
      db.selectWhere.mockResolvedValue([]);

      await expect(service.findOne(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findPublicLive()', () => {
    it('returns a live agent matching the share token', async () => {
      const row = agentRow({ status: 'live', shareToken: 'share_abc' });
      db.selectWhere.mockResolvedValue([row]);

      await expect(service.findPublicLive(AGENT_ID, 'share_abc')).resolves.toEqual(row);
      expect(db.selectWhere).toHaveBeenCalledTimes(1);
    });

    it('throws and skips the database when the share token is missing', async () => {
      await expect(service.findPublicLive(AGENT_ID, '')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(db.select).not.toHaveBeenCalled();
    });

    it('throws when no live agent matches the id and share token', async () => {
      db.selectWhere.mockResolvedValue([]);

      await expect(service.findPublicLive(AGENT_ID, 'wrong-token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create()', () => {
    it('inserts a tenant-scoped draft-compatible agent row', async () => {
      const row = agentRow({ name: 'Created Agent', templateId: 'template_1' });
      db.insertReturning.mockResolvedValue([row]);

      await expect(
        service.create(ORG, {
          name: 'Created Agent',
          templateId: 'template_1',
          uiConfig: { channels: ['Web'] },
        }),
      ).resolves.toEqual(row);
      expect(db.insertValues).toHaveBeenCalledWith({
        orgId: ORG,
        name: 'Created Agent',
        templateId: 'template_1',
        uiConfig: { channels: ['Web'] },
        aiConfig: null,
      });
    });
  });

  describe('update()', () => {
    it('verifies ownership and writes changed fields', async () => {
      const updated = agentRow({ name: 'Updated Agent' });
      db.selectWhere.mockResolvedValue([agentRow()]);
      db.updateReturning.mockResolvedValue([updated]);

      await expect(service.update(ORG, AGENT_ID, { name: 'Updated Agent' })).resolves.toEqual(
        updated,
      );
      expect(db.selectWhere).toHaveBeenCalledTimes(1);
      expect(db.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Agent',
          updatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('updateStatus()', () => {
    it.each([
      ['draft', 'live'],
      ['live', 'paused'],
      ['paused', 'live'],
    ] as const)('allows %s -> %s', async (fromStatus, toStatus) => {
      const updated = agentRow({ status: toStatus });
      db.selectWhere.mockResolvedValue([agentRow({ status: fromStatus })]);
      db.updateReturning.mockResolvedValue([updated]);

      await expect(service.updateStatus(ORG, AGENT_ID, { status: toStatus })).resolves.toEqual(
        updated,
      );
      expect(db.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: toStatus,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('rejects invalid transitions', async () => {
      db.selectWhere.mockResolvedValue([agentRow({ status: 'live' })]);

      await expect(service.updateStatus(ORG, AGENT_ID, { status: 'draft' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(db.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when a concurrent update wins the race', async () => {
      // findOne returns draft, but by the time UPDATE runs another request
      // has already changed the status — returning() comes back empty.
      db.selectWhere.mockResolvedValue([agentRow({ status: 'draft' })]);
      db.updateReturning.mockResolvedValue([]);

      await expect(
        service.updateStatus(ORG, AGENT_ID, { status: 'live' }),
      ).rejects.toBeInstanceOf(ConflictException);

      // UPDATE was attempted (transition was valid) but returned no rows
      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it('generates a share token when publishing an agent without one', async () => {
      db.selectWhere.mockResolvedValue([agentRow({ status: 'draft', shareToken: null })]);
      db.updateReturning.mockResolvedValue([agentRow({ status: 'live', shareToken: 'generated' })]);

      await service.updateStatus(ORG, AGENT_ID, { status: 'live' });

      expect(db.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'live',
          shareToken: expect.any(String),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('preserves the existing share token when resuming a paused agent', async () => {
      db.selectWhere.mockResolvedValue([
        agentRow({ status: 'paused', shareToken: 'existing-token' }),
      ]);
      db.updateReturning.mockResolvedValue([
        agentRow({ status: 'live', shareToken: 'existing-token' }),
      ]);

      await service.updateStatus(ORG, AGENT_ID, { status: 'live' });

      expect(db.updateSet).toHaveBeenCalledWith(
        expect.not.objectContaining({
          shareToken: expect.any(String),
        }),
      );
    });
  });

  describe('remove()', () => {
    it('verifies ownership and soft-deletes the row', async () => {
      db.selectWhere.mockResolvedValue([agentRow()]);

      await expect(service.remove(ORG, AGENT_ID)).resolves.toBeUndefined();
      expect(db.selectWhere).toHaveBeenCalledTimes(1);
      expect(db.updateSet).toHaveBeenCalledWith({
        deletedAt: expect.any(Date),
      });
    });
  });
});
