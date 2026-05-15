import { Test, TestingModule } from '@nestjs/testing';
import { AgentTypesController } from './agent-types.controller';
import { AgentTypesService } from './agent-types.service';

const ORG = 'org_catalog';

const mockAgentType = {
  id: 'type-1',
  slug: 'support',
  name: 'Customer Service',
  emoji: '💬',
  description: 'Support workflows',
  enabled: true,
  position: 0,
};

const mockService: jest.Mocked<AgentTypesService> = {
  list: jest.fn(),
  findOne: jest.fn(),
} as unknown as jest.Mocked<AgentTypesService>;

describe('AgentTypesController', () => {
  let controller: AgentTypesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentTypesController],
      providers: [{ provide: AgentTypesService, useValue: mockService }],
    }).compile();

    controller = module.get<AgentTypesController>(AgentTypesController);
  });

  it('lists visible agent types with tenant context', async () => {
    mockService.list.mockResolvedValue([mockAgentType]);

    await expect(controller.list(ORG)).resolves.toEqual([mockAgentType]);

    expect(mockService.list).toHaveBeenCalledWith(ORG);
  });
});
