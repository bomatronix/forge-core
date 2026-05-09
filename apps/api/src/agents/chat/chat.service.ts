import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { DraftAgent } from '@forge-core/common';
import { AgentsService } from '../agents.service';

export interface ChatResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  constructor(private readonly agentsService: AgentsService) {}

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

  async chat(
    orgId: string,
    agentId: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
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

      const content =
        response.content
          .filter((block) => block.type === 'text')
          .map((block) => (block as { type: 'text'; text: string }).text)
          .join('') ?? '';

      this.logger.log(
        `[chat] agent=${agentId} ← Anthropic ok in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
      );

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
      throw new BadGatewayException(
        `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
