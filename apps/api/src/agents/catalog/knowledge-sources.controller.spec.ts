import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeSourcesService } from './knowledge-sources.service';
import {
  AgentKnowledgeSourcesController,
  AgentTypeKnowledgeSourcesController,
  KnowledgeSourceOptionsController,
} from './knowledge-sources.controller';

const ORG = 'org_catalog';
const AGENT_ID = '00000000-0000-4000-8000-000000000001';

const mockSource = {
  id: 'source-1',
  slug: 'faq-database',
  name: 'FAQ Database',
  emoji: '❓',
  description: 'Frequently asked questions and answers',
  category: 'support',
  uiSchema: { setupMode: 'qa' as const },
  enabled: true,
  position: 0,
};

const mockService: jest.Mocked<KnowledgeSourcesService> = {
  listOptions: jest.fn(),
  listOptionsForAgentType: jest.fn(),
  updateAgentTypeOptions: jest.fn(),
  findSelections: jest.fn(),
  updateSelections: jest.fn(),
  seedSelectionsForCreatedAgent: jest.fn(),
} as unknown as jest.Mocked<KnowledgeSourcesService>;

describe('Knowledge source controllers', () => {
  let optionsController: KnowledgeSourceOptionsController;
  let typeSourcesController: AgentTypeKnowledgeSourcesController;
  let selectionsController: AgentKnowledgeSourcesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        KnowledgeSourceOptionsController,
        AgentTypeKnowledgeSourcesController,
        AgentKnowledgeSourcesController,
      ],
      providers: [{ provide: KnowledgeSourcesService, useValue: mockService }],
    }).compile();

    optionsController = module.get<KnowledgeSourceOptionsController>(
      KnowledgeSourceOptionsController,
    );
    typeSourcesController = module.get<AgentTypeKnowledgeSourcesController>(
      AgentTypeKnowledgeSourcesController,
    );
    selectionsController = module.get<AgentKnowledgeSourcesController>(
      AgentKnowledgeSourcesController,
    );
  });

  it('lists visible source options with tenant context', async () => {
    mockService.listOptions.mockResolvedValue([mockSource]);

    await expect(optionsController.list(ORG, undefined)).resolves.toEqual([mockSource]);

    expect(mockService.listOptions).toHaveBeenCalledWith(ORG, undefined);
  });

  it('lists visible source options by agent type', async () => {
    mockService.listOptions.mockResolvedValue([mockSource]);

    await expect(optionsController.list(ORG, 'support')).resolves.toEqual([mockSource]);

    expect(mockService.listOptions).toHaveBeenCalledWith(ORG, 'support');
  });

  it('lists configured sources for an agent type', async () => {
    mockService.listOptionsForAgentType.mockResolvedValue([mockSource]);

    await expect(typeSourcesController.list(ORG, 'support')).resolves.toEqual([mockSource]);

    expect(mockService.listOptionsForAgentType).toHaveBeenCalledWith(ORG, 'support');
  });

  it('updates configured sources for an agent type', async () => {
    mockService.updateAgentTypeOptions.mockResolvedValue([mockSource]);

    await expect(
      typeSourcesController.update(ORG, 'support', { sourceSlugs: ['faq-database'] }),
    ).resolves.toEqual([mockSource]);

    expect(mockService.updateAgentTypeOptions).toHaveBeenCalledWith(ORG, 'support', [
      'faq-database',
    ]);
  });

  it('lists selected sources for an agent', async () => {
    mockService.findSelections.mockResolvedValue([mockSource]);

    await expect(selectionsController.list(ORG, AGENT_ID)).resolves.toEqual([mockSource]);

    expect(mockService.findSelections).toHaveBeenCalledWith(ORG, AGENT_ID);
  });

  it('updates selected sources for an agent', async () => {
    mockService.updateSelections.mockResolvedValue([mockSource]);

    await expect(
      selectionsController.update(ORG, AGENT_ID, { sourceSlugs: ['faq-database'] }),
    ).resolves.toEqual([mockSource]);

    expect(mockService.updateSelections).toHaveBeenCalledWith(ORG, AGENT_ID, ['faq-database']);
  });
});
