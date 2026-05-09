import { BadGatewayException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { AgentsService } from '../agents.service';

// ---------------------------------------------------------------------------
// Anthropic SDK mock
// ---------------------------------------------------------------------------

const mockStream = jest.fn();
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStreamGen(chunks: string[], extraEvents: unknown[] = []) {
  async function* gen() {
    for (const text of chunks) {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
    }
    for (const event of extraEvents) {
      yield event;
    }
  }
  return gen();
}

async function collectAll<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iter) {
    results.push(item);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Test agent fixture
// ---------------------------------------------------------------------------

const testAgent = {
  id: 'agent-unit-test',
  orgId: 'org_unit',
  name: 'Aria',
  status: 'live',
  templateId: null,
  workspaceId: null,
  uiConfig: {
    identity: { tone: 'friendly', welcomeMessage: 'Hi there!' },
    behaviour: { systemPrompt: 'Be concise and helpful.' },
    channels: ['Web'],
  },
  aiConfig: null,
  shareToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ChatService', () => {
  let service: ChatService;
  let mockAgentsService: { findOne: jest.Mock };

  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key-unit';
    mockAgentsService = { findOne: jest.fn().mockResolvedValue(testAgent) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: AgentsService, useValue: mockAgentsService },
      ],
    }).compile();

    service = module.get(ChatService);
    await service.onModuleInit();

    mockStream.mockReset();
    mockCreate.mockReset();
  });

  // -------------------------------------------------------------------------
  // buildSystemPrompt
  // -------------------------------------------------------------------------

  describe('buildSystemPrompt', () => {
    it('starts with "You are {name}."', () => {
      const result = service.buildSystemPrompt({ name: 'Bot', uiConfig: null });
      expect(result).toContain('You are Bot.');
    });

    it('appends behaviour.systemPrompt when present', () => {
      const result = service.buildSystemPrompt({
        name: 'Bot',
        uiConfig: { behaviour: { systemPrompt: 'Always be polite.' } },
      });
      expect(result).toContain('Always be polite.');
    });

    it('appends friendly tone instruction', () => {
      const result = service.buildSystemPrompt({
        name: 'Bot',
        uiConfig: { identity: { tone: 'friendly' } },
      });
      expect(result).toContain('warm');
    });

    it('appends formal tone instruction for "formal"', () => {
      const result = service.buildSystemPrompt({
        name: 'Bot',
        uiConfig: { identity: { tone: 'formal' } },
      });
      expect(result).toContain('professional');
    });

    it('appends formal tone instruction for "professional"', () => {
      const result = service.buildSystemPrompt({
        name: 'Bot',
        uiConfig: { identity: { tone: 'professional' } },
      });
      expect(result).toContain('professional');
    });

    it('appends welcomeMessage in quotes', () => {
      const result = service.buildSystemPrompt({
        name: 'Bot',
        uiConfig: { identity: { welcomeMessage: 'Hello!' } },
      });
      expect(result).toContain('"Hello!"');
    });

    it('handles null uiConfig gracefully', () => {
      const result = service.buildSystemPrompt({ name: 'Bot', uiConfig: null });
      expect(result).toBe('You are Bot.');
    });
  });

  // -------------------------------------------------------------------------
  // streamChat
  // -------------------------------------------------------------------------

  describe('streamChat', () => {
    const messages = [{ role: 'user' as const, content: 'Hi' }];

    it('yields delta events for each text chunk', async () => {
      mockStream.mockImplementation(() => makeStreamGen(['Hello ', 'World']));

      const events = await collectAll(await service.streamChat('org_unit', 'agent-unit-test', messages));

      expect(events).toContainEqual({ type: 'delta', content: 'Hello ' });
      expect(events).toContainEqual({ type: 'delta', content: 'World' });
    });

    it('yields { type: "done" } as the last event', async () => {
      mockStream.mockImplementation(() => makeStreamGen(['Hello']));

      const events = await collectAll(await service.streamChat('org_unit', 'agent-unit-test', messages));

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('silently skips non-text-delta events', async () => {
      mockStream.mockImplementation(() =>
        makeStreamGen(['Hi'], [
          { type: 'message_start', message: {} },
          { type: 'content_block_start', index: 0 },
        ]),
      );

      const events = await collectAll(await service.streamChat('org_unit', 'agent-unit-test', messages));

      // Only delta + done — no message_start or content_block_start
      const types = events.map((e) => e.type);
      expect(types).not.toContain('message_start');
      expect(types).not.toContain('content_block_start');
    });

    it('throws BadGatewayException when Anthropic stream throws', async () => {
      mockStream.mockImplementation(() => {
        async function* gen() {
          throw new Error('upstream failure');
          yield; // make TypeScript happy
        }
        return gen();
      });

      const stream = await service.streamChat('org_unit', 'agent-unit-test', messages);
      await expect(collectAll(stream)).rejects.toThrow(BadGatewayException);
    });

    it('throws NotFoundException from AgentsService when agent not found', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      mockAgentsService.findOne.mockRejectedValue(new NotFoundException('Agent not found'));

      // findOne is called eagerly inside streamChat (before returning the iterable)
      await expect(
        service.streamChat('org_unit', 'missing-agent', messages),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
