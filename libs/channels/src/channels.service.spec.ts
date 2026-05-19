import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DbClient } from '@forge-core/core';
import { ChannelsService } from './channels.service';
import type { CreateChannelDto, UpdateChannelDto, UpsertRoutingRuleDto } from './channels.service';

const ORG = 'org_ch_unit';
const OTHER_ORG = 'org_ch_other';
const CH_ID = 'ch_test_1';
const RULE_ID = 'rule_1';
const AGENT_ID = 'agent_1';

// ─── Row factories ────────────────────────────────────────────────────────────

type ChannelDbRow = {
  id: string;
  orgId: string;
  channelType: string;
  name: string;
  config: Record<string, unknown>;
  webhookSecret: string | null;
  status: string;
  workspaceInstructions: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RuleDbRow = {
  id: string;
  workspaceChannelId: string;
  orgId: string;
  priority: number;
  conditionType: string;
  conditionValue: Record<string, unknown>;
  agentId: string;
  agentInstructions: string | null;
  createdAt: Date;
};

function channelDbRow(overrides: Partial<ChannelDbRow> = {}): ChannelDbRow {
  const now = new Date('2026-05-16T00:00:00.000Z');
  return {
    id: CH_ID,
    orgId: ORG,
    channelType: 'test',
    name: 'My Test Channel',
    config: {},
    webhookSecret: null,
    status: 'active',
    workspaceInstructions: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function ruleDbRow(overrides: Partial<RuleDbRow> = {}): RuleDbRow {
  return {
    id: RULE_ID,
    workspaceChannelId: CH_ID,
    orgId: ORG,
    priority: 0,
    conditionType: 'always',
    conditionValue: {},
    agentId: AGENT_ID,
    agentInstructions: null,
    createdAt: new Date('2026-05-16T00:00:00.000Z'),
    ...overrides,
  };
}

// ─── DB mock factory ──────────────────────────────────────────────────────────

/**
 * Creates a mock DB client with fully chainable Drizzle-style builders.
 *
 * select().from().where()                      → selectWhere result
 * select().from().where().orderBy()            → selectOrderBy result
 * select().from().where().limit()              → selectLimit result (for resolveRoutingRules)
 * insert().values().returning()                → insertReturning result
 * update().set().where().returning()           → updateReturning result
 * delete().where()                             → void
 */
function createDbMock() {
  const selectOrderBy: jest.Mock = jest.fn();
  const selectLimit: jest.Mock = jest.fn();
  const selectWhere: jest.Mock = jest.fn(() => ({ orderBy: selectOrderBy, limit: selectLimit }));
  const selectFrom: jest.Mock = jest.fn(() => ({ where: selectWhere, orderBy: selectOrderBy }));
  const select: jest.Mock = jest.fn(() => ({ from: selectFrom }));

  const insertReturning: jest.Mock = jest.fn();
  const insertValues: jest.Mock = jest.fn(() => ({ returning: insertReturning }));
  const insert: jest.Mock = jest.fn(() => ({ values: insertValues }));

  const updateReturning: jest.Mock = jest.fn();
  const updateWhere: jest.Mock = jest.fn(() => ({ returning: updateReturning }));
  const updateSet: jest.Mock = jest.fn(() => ({ where: updateWhere }));
  const update: jest.Mock = jest.fn(() => ({ set: updateSet }));

  const deleteWhere: jest.Mock = jest.fn().mockResolvedValue(undefined);
  const deleteFn: jest.Mock = jest.fn(() => ({ where: deleteWhere }));

  return {
    db: { select, insert, update, delete: deleteFn } as unknown as DbClient,
    select,
    selectFrom,
    selectWhere,
    selectOrderBy,
    selectLimit,
    insert,
    insertValues,
    insertReturning,
    update,
    updateSet,
    updateWhere,
    updateReturning,
    deleteFn,
    deleteWhere,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ChannelsService', () => {
  let db: ReturnType<typeof createDbMock>;
  let service: ChannelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createDbMock();
    service = new ChannelsService(db.db);
  });

  // ─── Catalog ────────────────────────────────────────────────────────────────

  describe('getCatalog()', () => {
    it('returns an array that includes the test adapter', () => {
      const catalog = service.getCatalog();
      expect(Array.isArray(catalog)).toBe(true);
      expect(catalog.length).toBeGreaterThan(0);
      const testEntry = catalog.find((c) => c.type === 'test');
      expect(testEntry).toBeDefined();
      expect(testEntry).toMatchObject({
        type: 'test',
        name: expect.any(String),
        iconSlug: expect.any(String),
        capabilities: expect.arrayContaining(['send', 'receive']),
        configSchema: expect.any(Object),
        setupInstructions: expect.any(String),
      });
    });

    it('includes all 7 channel types', () => {
      const catalog = service.getCatalog();
      const types = catalog.map((c) => c.type);
      expect(types).toEqual(
        expect.arrayContaining(['test', 'webhook', 'slack', 'email', 'sms', 'whatsapp', 'website']),
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('queries DB and maps rows to ChannelRow[]', async () => {
      const row = channelDbRow();
      db.selectOrderBy.mockResolvedValue([row]);

      const result = await service.findAll(ORG);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: CH_ID,
        orgId: ORG,
        channelType: 'test',
        name: 'My Test Channel',
        status: 'active',
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    });

    it('returns empty array when org has no channels', async () => {
      db.selectOrderBy.mockResolvedValue([]);
      await expect(service.findAll(ORG)).resolves.toEqual([]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns mapped ChannelRow when found', async () => {
      db.selectWhere.mockResolvedValue([channelDbRow()]);
      const result = await service.findOne(ORG, CH_ID);
      expect(result).toMatchObject({ id: CH_ID, orgId: ORG });
    });

    it('throws NotFoundException when row is missing', async () => {
      db.selectWhere.mockResolvedValue([]);
      await expect(service.findOne(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── findByIdPublic ─────────────────────────────────────────────────────────

  describe('findByIdPublic()', () => {
    it('returns raw row for an active channel', async () => {
      const row = channelDbRow({ status: 'active' });
      db.selectWhere.mockResolvedValue([row]);
      await expect(service.findByIdPublic(CH_ID)).resolves.toEqual(row);
    });

    it('throws BadRequestException for a paused channel', async () => {
      db.selectWhere.mockResolvedValue([channelDbRow({ status: 'paused' })]);
      await expect(service.findByIdPublic(CH_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when channel does not exist', async () => {
      db.selectWhere.mockResolvedValue([]);
      await expect(service.findByIdPublic('nonexistent')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts a row and returns mapped ChannelRow', async () => {
      const row = channelDbRow();
      db.insertReturning.mockResolvedValue([row]);

      const dto: CreateChannelDto = { channelType: 'test', name: 'My Test Channel' };
      const result = await service.create(ORG, dto);

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          channelType: 'test',
          name: 'My Test Channel',
        }),
      );
      expect(result).toMatchObject({ id: CH_ID, channelType: 'test', name: 'My Test Channel' });
    });

    it('throws when channelType is not a recognized adapter', async () => {
      const dto = { channelType: 'carrier-pigeon', name: 'Bad' } as unknown as CreateChannelDto;
      await expect(service.create(ORG, dto)).rejects.toThrow();
    });

    it('normalizes and deduplicates website allowed domains before insert', async () => {
      const row = channelDbRow({
        channelType: 'website',
        config: {
          agentId: AGENT_ID,
          allowedDomains: ['example.com', 'www.example.com'],
        },
      });
      db.insertReturning.mockResolvedValue([row]);

      await service.create(ORG, {
        channelType: 'website',
        name: 'Website',
        config: {
          agentId: AGENT_ID,
          allowedDomains: ['Example.com', 'www.example.com', 'example.com', '  '],
        },
      });

      expect(db.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: 'website',
          config: expect.objectContaining({
            allowedDomains: ['example.com', 'www.example.com'],
          }),
        }),
      );
    });

    it('rejects website allowed domains with protocols or paths', async () => {
      await expect(
        service.create(ORG, {
          channelType: 'website',
          name: 'Website',
          config: { allowedDomains: ['https://example.com'] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.create(ORG, {
          channelType: 'website',
          name: 'Website',
          config: { allowedDomains: ['example.com/chat'] },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('performs 404 guard then updates and returns mapped row', async () => {
      const original = channelDbRow();
      const updated = channelDbRow({ name: 'Renamed' });

      // findOne called first, then update.where.returning
      db.selectWhere.mockResolvedValue([original]);
      db.updateReturning.mockResolvedValue([updated]);

      const dto: UpdateChannelDto = { name: 'Renamed' };
      const result = await service.update(ORG, CH_ID, dto);

      expect(db.update).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ name: 'Renamed' });
    });

    it('throws NotFoundException when channel does not exist', async () => {
      db.selectWhere.mockResolvedValue([]);
      await expect(service.update(ORG, 'missing', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('invalidates cached website origins after update', async () => {
      db.selectOrderBy.mockResolvedValueOnce([
        channelDbRow({
          channelType: 'website',
          config: { agentId: AGENT_ID, allowedDomains: ['old.example'] },
        }),
      ]);
      await expect(service.isCorsOriginAllowed('https://old.example')).resolves.toBe(true);

      db.selectWhere.mockResolvedValueOnce([
        channelDbRow({
          channelType: 'website',
          config: { agentId: AGENT_ID, allowedDomains: ['old.example'] },
        }),
      ]);
      db.updateReturning.mockResolvedValue([
        channelDbRow({
          channelType: 'website',
          config: { agentId: AGENT_ID, allowedDomains: ['new.example'] },
        }),
      ]);

      await service.update(ORG, CH_ID, {
        config: { agentId: AGENT_ID, allowedDomains: ['new.example'] },
      });

      db.selectOrderBy.mockResolvedValueOnce([
        channelDbRow({
          channelType: 'website',
          config: { agentId: AGENT_ID, allowedDomains: ['new.example'] },
        }),
      ]);
      await expect(service.isCorsOriginAllowed('https://new.example')).resolves.toBe(true);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('calls findOne for the 404 guard then deletes', async () => {
      db.selectWhere.mockResolvedValue([channelDbRow()]);

      await service.remove(ORG, CH_ID);

      expect(db.deleteFn).toHaveBeenCalledTimes(1);
      expect(db.deleteWhere).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when channel does not exist', async () => {
      db.selectWhere.mockResolvedValue([]);
      await expect(service.remove(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── findRoutingRules ───────────────────────────────────────────────────────

  describe('findRoutingRules()', () => {
    it('guards org membership then returns ordered rules', async () => {
      const rule = ruleDbRow();
      // First call: findOne (selectWhere) — returns the channel
      db.selectWhere.mockResolvedValueOnce([channelDbRow()]);
      // Second call: the SELECT over channelRoutingRules (orderBy chain)
      db.selectOrderBy.mockResolvedValue([rule]);

      const result = await service.findRoutingRules(ORG, CH_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: RULE_ID,
        workspaceChannelId: CH_ID,
        orgId: ORG,
        conditionType: 'always',
        agentId: AGENT_ID,
      });
    });
  });

  // ─── upsertRoutingRule ──────────────────────────────────────────────────────

  describe('upsertRoutingRule()', () => {
    it('guards org membership then inserts rule', async () => {
      const rule = ruleDbRow();
      db.selectWhere.mockResolvedValue([channelDbRow()]);
      db.insertReturning.mockResolvedValue([rule]);

      const dto: UpsertRoutingRuleDto = {
        conditionType: 'always',
        agentId: AGENT_ID,
      };
      const result = await service.upsertRoutingRule(ORG, CH_ID, dto);

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        id: RULE_ID,
        conditionType: 'always',
        agentId: AGENT_ID,
      });
    });
  });

  // ─── deleteRoutingRule ──────────────────────────────────────────────────────

  describe('deleteRoutingRule()', () => {
    it('guards org membership then deletes rule', async () => {
      db.selectWhere.mockResolvedValue([channelDbRow()]);

      await service.deleteRoutingRule(ORG, CH_ID, RULE_ID);

      expect(db.deleteFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('website origin checks', () => {
    it('allows origins configured on active website channels', async () => {
      db.selectOrderBy.mockResolvedValue([
        channelDbRow({
          channelType: 'website',
          status: 'active',
          config: { agentId: AGENT_ID, allowedDomains: ['client.example'] },
        }),
      ]);

      await expect(service.isCorsOriginAllowed('https://client.example')).resolves.toBe(true);
      await expect(
        service.isAgentOriginAllowed(ORG, AGENT_ID, 'https://client.example'),
      ).resolves.toBe(true);
    });

    it('does not allow a domain configured for a different agent', async () => {
      db.selectOrderBy.mockResolvedValue([
        channelDbRow({
          channelType: 'website',
          status: 'active',
          config: { agentId: 'other-agent', allowedDomains: ['client.example'] },
        }),
      ]);

      await expect(service.isCorsOriginAllowed('https://client.example')).resolves.toBe(true);
      await expect(
        service.isAgentOriginAllowed(ORG, AGENT_ID, 'https://client.example'),
      ).resolves.toBe(false);
    });

    it('does not allow a domain configured for the same agent in a different org', async () => {
      db.selectOrderBy.mockResolvedValue([
        channelDbRow({
          orgId: OTHER_ORG,
          channelType: 'website',
          status: 'active',
          config: { agentId: AGENT_ID, allowedDomains: ['client.example'] },
        }),
      ]);

      await expect(service.isCorsOriginAllowed('https://client.example')).resolves.toBe(true);
      await expect(
        service.isAgentOriginAllowed(ORG, AGENT_ID, 'https://client.example'),
      ).resolves.toBe(false);
    });

    it('allows no-origin agent requests for server-side callers', async () => {
      await expect(service.isAgentOriginAllowed(ORG, AGENT_ID, undefined)).resolves.toBe(true);
    });
  });
});
