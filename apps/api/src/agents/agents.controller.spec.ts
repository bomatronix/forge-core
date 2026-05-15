import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

const ORG = 'org_test123';
const AGENT_ID = 'agent_abc';

const mockAgent = {
  id: AGENT_ID,
  name: 'Test Agent',
  agentType: 'custom',
  status: 'draft' as const,
  channels: [] as never[],
  conversations: 0,
  resolution: null,
  csat: null,
} as never;

const mockService: jest.Mocked<AgentsService> = {
  list: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
} as unknown as jest.Mocked<AgentsService>;

describe('AgentsController', () => {
  let controller: AgentsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [{ provide: AgentsService, useValue: mockService }],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  describe('list()', () => {
    it('delegates to service with org context', async () => {
      mockService.list.mockResolvedValue([mockAgent]);
      const result = await controller.list(ORG, 'support', 'draft', 'support');
      expect(mockService.list).toHaveBeenCalledWith(ORG, {
        search: 'support',
        status: 'draft',
        agentType: 'support',
      });
      expect(result).toEqual([mockAgent]);
    });
  });

  describe('findOne()', () => {
    it('delegates to service with org + id', async () => {
      mockService.findOne.mockResolvedValue(mockAgent);
      const result = await controller.findOne(ORG, AGENT_ID);
      expect(mockService.findOne).toHaveBeenCalledWith(ORG, AGENT_ID);
      expect(result).toEqual(mockAgent);
    });

    it('propagates NotFoundException from service', async () => {
      mockService.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create()', () => {
    it('delegates to service with org + dto', async () => {
      const dto = { name: 'My Agent' };
      mockService.create.mockResolvedValue({ id: 'new', ...dto } as never);
      await controller.create(ORG, dto as never);
      expect(mockService.create).toHaveBeenCalledWith(ORG, dto);
    });
  });

  describe('update()', () => {
    it('delegates to service with org + id + dto', async () => {
      const dto = { name: 'Updated' };
      mockService.update.mockResolvedValue({ id: AGENT_ID, ...dto } as never);
      await controller.update(ORG, AGENT_ID, dto as never);
      expect(mockService.update).toHaveBeenCalledWith(ORG, AGENT_ID, dto);
    });
  });

  describe('updateStatus()', () => {
    it('delegates to service with org + id + dto', async () => {
      const dto = { status: 'live' as const };
      mockService.updateStatus.mockResolvedValue({ id: AGENT_ID, ...dto } as never);
      await controller.updateStatus(ORG, AGENT_ID, dto);
      expect(mockService.updateStatus).toHaveBeenCalledWith(ORG, AGENT_ID, dto);
    });
  });

  describe('remove()', () => {
    it('delegates to service with org + id', async () => {
      mockService.remove.mockResolvedValue(undefined);
      await controller.remove(ORG, AGENT_ID);
      expect(mockService.remove).toHaveBeenCalledWith(ORG, AGENT_ID);
    });
  });
});
