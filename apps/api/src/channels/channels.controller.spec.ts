import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService, ChannelConversationService } from '@forge-core/channels';
import type {
  ChannelRow,
  RoutingRuleRow,
  CreateChannelDto,
  UpdateChannelDto,
  UpsertRoutingRuleDto,
  ChannelCatalogItem,
} from '@forge-core/channels';

const ORG = 'org_ctrl_test';
const CH_ID = 'ch_abc';
const RULE_ID = 'rule_xyz';
const AGENT_ID = 'agent_1';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockChannel: ChannelRow = {
  id: CH_ID,
  orgId: ORG,
  channelType: 'test',
  name: 'Dev Test',
  config: {},
  webhookSecret: null,
  status: 'active',
  workspaceInstructions: null,
  createdAt: '2026-05-16T00:00:00.000Z',
  updatedAt: '2026-05-16T00:00:00.000Z',
};

const mockRule: RoutingRuleRow = {
  id: RULE_ID,
  workspaceChannelId: CH_ID,
  orgId: ORG,
  priority: 0,
  conditionType: 'always',
  conditionValue: {},
  agentId: AGENT_ID,
  agentInstructions: null,
  createdAt: '2026-05-16T00:00:00.000Z',
};

const mockCatalogItem: ChannelCatalogItem = {
  type: 'test',
  name: 'Test Channel',
  iconSlug: 'flask-conical',
  capabilities: ['send', 'receive'],
  configSchema: {},
  setupInstructions: '## Test Channel',
};

// ─── Full mock service ────────────────────────────────────────────────────────

const mockService: jest.Mocked<ChannelsService> = {
  getCatalog: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  findOneRaw: jest.fn(),
  findByIdPublic: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  validateConfig: jest.fn(),
  findRoutingRules: jest.fn(),
  upsertRoutingRule: jest.fn(),
  deleteRoutingRule: jest.fn(),
  resolveRoutingRules: jest.fn(),
  replaceRoutingRules: jest.fn(),
} as unknown as jest.Mocked<ChannelsService>;

const mockConvService: jest.Mocked<ChannelConversationService> = {
  findByChannel: jest.fn(),
} as unknown as jest.Mocked<ChannelConversationService>;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ChannelsController', () => {
  let controller: ChannelsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChannelsController],
      providers: [
        { provide: ChannelsService, useValue: mockService },
        { provide: ChannelConversationService, useValue: mockConvService },
      ],
    }).compile();

    controller = module.get<ChannelsController>(ChannelsController);
  });

  // ─── getCatalog ─────────────────────────────────────────────────────────────

  describe('getCatalog()', () => {
    it('delegates to service and returns catalog', () => {
      mockService.getCatalog.mockReturnValue([mockCatalogItem]);

      const result = controller.getCatalog();

      expect(mockService.getCatalog).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockCatalogItem]);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('delegates to service with orgId', async () => {
      mockService.findAll.mockResolvedValue([mockChannel]);

      const result = await controller.findAll(ORG);

      expect(mockService.findAll).toHaveBeenCalledWith(ORG);
      expect(result).toEqual([mockChannel]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('delegates to service with orgId + id', async () => {
      mockService.findOne.mockResolvedValue(mockChannel);

      const result = await controller.findOne(ORG, CH_ID);

      expect(mockService.findOne).toHaveBeenCalledWith(ORG, CH_ID);
      expect(result).toEqual(mockChannel);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException());

      await expect(controller.findOne(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('delegates to service with orgId + dto', async () => {
      const dto: CreateChannelDto = { channelType: 'test', name: 'New Channel' };
      mockService.create.mockResolvedValue({ ...mockChannel, name: 'New Channel' });

      const result = await controller.create(ORG, dto);

      expect(mockService.create).toHaveBeenCalledWith(ORG, dto);
      expect(result).toMatchObject({ name: 'New Channel' });
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('delegates to service with orgId + id + dto', async () => {
      const dto: UpdateChannelDto = { name: 'Renamed' };
      mockService.update.mockResolvedValue({ ...mockChannel, name: 'Renamed' });

      const result = await controller.update(ORG, CH_ID, dto);

      expect(mockService.update).toHaveBeenCalledWith(ORG, CH_ID, dto);
      expect(result).toMatchObject({ name: 'Renamed' });
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('delegates to service with orgId + id', async () => {
      mockService.remove.mockResolvedValue(undefined);

      await controller.remove(ORG, CH_ID);

      expect(mockService.remove).toHaveBeenCalledWith(ORG, CH_ID);
    });
  });

  // ─── validateConfig ─────────────────────────────────────────────────────────

  describe('validateConfig()', () => {
    it('delegates to service with orgId + id', async () => {
      mockService.validateConfig.mockResolvedValue({ ok: true });

      const result = await controller.validateConfig(ORG, CH_ID);

      expect(mockService.validateConfig).toHaveBeenCalledWith(ORG, CH_ID);
      expect(result).toEqual({ ok: true });
    });
  });

  // ─── getWebhookUrl ──────────────────────────────────────────────────────────

  describe('getWebhookUrl()', () => {
    it('returns webhook URL using APP_BASE_URL env or fallback', () => {
      delete process.env.APP_BASE_URL;
      const result = controller.getWebhookUrl(ORG, CH_ID);
      expect(result).toEqual({
        webhookUrl: `http://localhost:3001/api/public/webhook/${CH_ID}`,
      });
    });

    it('uses APP_BASE_URL when set', () => {
      process.env.APP_BASE_URL = 'https://api.example.com';
      const result = controller.getWebhookUrl(ORG, CH_ID);
      expect(result).toEqual({
        webhookUrl: `https://api.example.com/api/public/webhook/${CH_ID}`,
      });
      delete process.env.APP_BASE_URL;
    });
  });

  // ─── findRoutingRules ───────────────────────────────────────────────────────

  describe('findRoutingRules()', () => {
    it('delegates to service with orgId + channelId', async () => {
      mockService.findRoutingRules.mockResolvedValue([mockRule]);

      const result = await controller.findRoutingRules(ORG, CH_ID);

      expect(mockService.findRoutingRules).toHaveBeenCalledWith(ORG, CH_ID);
      expect(result).toEqual([mockRule]);
    });
  });

  // ─── upsertRoutingRule ──────────────────────────────────────────────────────

  describe('upsertRoutingRule()', () => {
    it('delegates to service with orgId + channelId + dto', async () => {
      const dto: UpsertRoutingRuleDto = {
        conditionType: 'always',
        agentId: AGENT_ID,
      };
      mockService.upsertRoutingRule.mockResolvedValue(mockRule);

      const result = await controller.upsertRoutingRule(ORG, CH_ID, dto);

      expect(mockService.upsertRoutingRule).toHaveBeenCalledWith(ORG, CH_ID, dto);
      expect(result).toEqual(mockRule);
    });
  });

  // ─── deleteRoutingRule ──────────────────────────────────────────────────────

  describe('deleteRoutingRule()', () => {
    it('delegates to service with orgId + channelId + ruleId', async () => {
      mockService.deleteRoutingRule.mockResolvedValue(undefined);

      await controller.deleteRoutingRule(ORG, CH_ID, RULE_ID);

      expect(mockService.deleteRoutingRule).toHaveBeenCalledWith(ORG, CH_ID, RULE_ID);
    });
  });
});
