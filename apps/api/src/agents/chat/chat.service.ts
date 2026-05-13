import { BadGatewayException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import type { DraftAgent } from '@forge-core/common';
import { AgentsService } from '../agents.service';
import {
  AgentUsageEventsService,
  type AgentUsageSource,
} from '../agent-usage-events.service';

export interface ChatResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type AgentPromptRow = { id: string; orgId: string; name: string; uiConfig: unknown };
type StreamEvent = { type: 'delta'; content: string } | { type: 'done' };

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);
  private anthropic!: Anthropic;

  constructor(
    private readonly agentsService: AgentsService,
    private readonly usageEventsService: AgentUsageEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rawKey = process.env.ANTHROPIC_API_KEY;
    if (!rawKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    const apiKey = rawKey.startsWith('arn:aws:secretsmanager:')
      ? await this.resolveSecret(rawKey)
      : rawKey;
    this.anthropic = new Anthropic({ apiKey });
  }

  private async resolveSecret(arn: string): Promise<string> {
    const client = new SecretsManagerClient({});
    const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    const raw = result.SecretString;
    if (!raw) {
      throw new Error(`Secret ${arn} has no string value`);
    }
    // Secrets Manager supports both plain strings and JSON objects.
    // If stored as JSON (e.g. {"ANTHROPIC_API_KEY": "sk-ant-..."}), prefer the
    // explicit key name; fall back to first value for other JSON secrets.
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const value = parsed['ANTHROPIC_API_KEY'] ?? Object.values(parsed)[0];
      if (typeof value === 'string') return value.trim();
    } catch {
      // not JSON — use raw
    }
    return raw.trim();
  }

  buildSystemPrompt(row: { name: string; uiConfig: unknown }): string {
    const ui = row.uiConfig as DraftAgent | null;
    const parts: string[] = [`You are ${row.name}.`];

    if (ui?.behaviour?.systemPrompt) parts.push(ui.behaviour.systemPrompt);
    if (ui?.identity?.tone === 'friendly')
      parts.push('Be warm, approachable, and conversational.');
    if (ui?.identity?.tone === 'formal' || ui?.identity?.tone === 'professional')
      parts.push('Be professional, precise, and formal.');
    if (ui?.identity?.welcomeMessage)
      parts.push(`Your opening line is: "${ui.identity.welcomeMessage}"`);

    return parts.join('\n');
  }

  async streamChat(
    orgId: string,
    agentId: string,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<StreamEvent>> {
    // Validate agent eagerly so callers can handle 404 before committing to a streaming response
    const row = await this.agentsService.findOne(orgId, agentId);
    return this.streamWithAgent(row, messages, `org=${orgId}`, 'builder_test');
  }

  async streamPublicChat(
    agentId: string,
    shareToken: string,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<StreamEvent>> {
    const row = await this.agentsService.findPublicLive(agentId, shareToken);
    return this.streamWithAgent(row, messages, 'public=true', 'public');
  }

  private async recordChatUsage(
    row: AgentPromptRow,
    source: AgentUsageSource,
    usage?: { inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    try {
      await this.usageEventsService.recordChatMessage({
        orgId: row.orgId,
        agentId: row.id,
        source,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      });
    } catch (err) {
      this.usageEventsService.logRecordFailure(row.id, err);
    }
  }

  private streamWithAgent(
    row: AgentPromptRow,
    messages: ChatMessage[],
    logContext: string,
    source: AgentUsageSource,
  ): AsyncIterable<StreamEvent> {
    const system = this.buildSystemPrompt(row);
    const anthropic = this.anthropic;
    const logger = this.logger;
    const recordChatUsage = this.recordChatUsage.bind(this);

    this.logger.log(
      `[streamChat] ${logContext} agent=${row.id} name="${row.name}" messages=${messages.length} → Anthropic`,
    );

    async function* gen(): AsyncGenerator<StreamEvent> {
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system,
          messages,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            yield { type: 'delta', content: event.delta.text };
          }
        }

        await recordChatUsage(row, source);
        yield { type: 'done' };
      } catch (err) {
        logger.error(
          `[streamChat] agent=${row.id} ← Anthropic error: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new BadGatewayException('Upstream API error');
      }
    }

    return gen();
  }

  async chat(
    orgId: string,
    agentId: string,
    messages: ChatMessage[],
  ): Promise<ChatResponse> {
    const row = await this.agentsService.findOne(orgId, agentId);
    const system = this.buildSystemPrompt(row);

    this.logger.log(
      `[chat] org=${orgId} agent=${agentId} name="${row.name}" messages=${messages.length} → Anthropic`,
    );

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        messages,
      });

      const content = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as { type: 'text'; text: string }).text)
        .join('');

      this.logger.log(
        `[chat] agent=${agentId} ← Anthropic ok in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
      );

      await this.recordChatUsage(row, 'builder_test', {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      return {
        content,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (err) {
      this.logger.error(
        `[chat] agent=${agentId} ← Anthropic error: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadGatewayException('Upstream API error');
    }
  }
}
