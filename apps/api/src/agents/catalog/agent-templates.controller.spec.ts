import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentTemplatesController } from './agent-templates.controller';
import { AgentTemplatesService } from './agent-templates.service';

const ORG = 'org_catalog';

const mockTemplate = {
  id: 'customer-support',
  name: 'Customer Support',
  emoji: '💬',
  category: 'support',
  agentType: 'support',
  description: 'FAQ, order tracking, and escalation',
  identity: {},
  behaviour: {},
  actions: [],
  channels: ['web'],
  knowledge: ['faq-database'],
  knowledgeSourceSlugs: ['faq-database'],
  knowledgeSources: [],
} as never;

const mockService: jest.Mocked<AgentTemplatesService> = {
  list: jest.fn(),
  findOne: jest.fn(),
} as unknown as jest.Mocked<AgentTemplatesService>;

describe('AgentTemplatesController', () => {
  let controller: AgentTemplatesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentTemplatesController],
      providers: [{ provide: AgentTemplatesService, useValue: mockService }],
    }).compile();

    controller = module.get<AgentTemplatesController>(AgentTemplatesController);
  });

  it('lists templates with tenant and category context', async () => {
    mockService.list.mockResolvedValue([mockTemplate]);

    await expect(controller.list(ORG, 'support')).resolves.toEqual([mockTemplate]);

    expect(mockService.list).toHaveBeenCalledWith(ORG, 'support');
  });

  it('fetches a template by slug with tenant context', async () => {
    mockService.findOne.mockResolvedValue(mockTemplate);

    await expect(controller.findOne(ORG, 'customer-support')).resolves.toEqual(mockTemplate);

    expect(mockService.findOne).toHaveBeenCalledWith(ORG, 'customer-support');
  });

  it('propagates missing templates', async () => {
    mockService.findOne.mockRejectedValue(new NotFoundException());

    await expect(controller.findOne(ORG, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
