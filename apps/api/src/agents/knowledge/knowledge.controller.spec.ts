import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';

const ORG = 'org_knowledge';
const AGENT_ID = 'agent_knowledge';
const ITEM_ID = 'item_knowledge';

const mockItem = {
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
  createdAt: new Date('2026-05-14T00:00:00.000Z'),
  updatedAt: new Date('2026-05-14T00:00:00.000Z'),
} as never;

const mockService: jest.Mocked<KnowledgeService> = {
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
} as unknown as jest.Mocked<KnowledgeService>;

describe('KnowledgeController', () => {
  let controller: KnowledgeController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [{ provide: KnowledgeService, useValue: mockService }],
    }).compile();

    controller = module.get<KnowledgeController>(KnowledgeController);
  });

  it('lists knowledge with tenant and agent context', async () => {
    mockService.findAll.mockResolvedValue([mockItem]);

    await expect(controller.list(ORG, AGENT_ID)).resolves.toEqual([mockItem]);

    expect(mockService.findAll).toHaveBeenCalledWith(ORG, AGENT_ID);
  });

  it('creates knowledge with tenant and agent context', async () => {
    const dto = { type: 'qa' as const, question: 'Q', answer: 'A' };
    mockService.create.mockResolvedValue(mockItem);

    await expect(controller.create(ORG, AGENT_ID, dto)).resolves.toEqual(mockItem);

    expect(mockService.create).toHaveBeenCalledWith(ORG, AGENT_ID, dto);
  });

  it('updates knowledge with tenant, agent, and item context', async () => {
    const dto = { answer: 'Updated' };
    mockService.update.mockResolvedValue(mockItem);

    await expect(controller.update(ORG, AGENT_ID, ITEM_ID, dto)).resolves.toEqual(mockItem);

    expect(mockService.update).toHaveBeenCalledWith(ORG, AGENT_ID, ITEM_ID, dto);
  });

  it('deletes knowledge with tenant, agent, and item context', async () => {
    mockService.remove.mockResolvedValue(undefined);

    await expect(controller.remove(ORG, AGENT_ID, ITEM_ID)).resolves.toBeUndefined();

    expect(mockService.remove).toHaveBeenCalledWith(ORG, AGENT_ID, ITEM_ID);
  });

  it('propagates NotFoundException from service', async () => {
    mockService.findAll.mockRejectedValue(new NotFoundException());

    await expect(controller.list(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
