import {
  Injectable,
  Logger,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelConversationService } from './conversation.service';
import { resolveChannelAdapter } from './channel-registry';
import type { InboundMessage, ChannelType } from './adapters/channel.adapter';

// ─── Injection tokens ─────────────────────────────────────────────────────────
// These decouple the lib from the concrete app-layer service classes.
// The app module provides the concrete implementations via `useExisting`.

export const INBOUND_AGENTS_SERVICE = Symbol('INBOUND_AGENTS_SERVICE');
export const INBOUND_CHAT_SERVICE = Symbol('INBOUND_CHAT_SERVICE');
export const INBOUND_KNOWLEDGE_SERVICE = Symbol('INBOUND_KNOWLEDGE_SERVICE');

// ─── Minimal interfaces consumed by InboundService ────────────────────────────

export interface IInboundAgentsService {
  findOne(orgId: string, agentId: string): Promise<{ id: string; [key: string]: unknown }>;
}

export interface IInboundChatService {
  buildSystemPrompt(agent: unknown, knowledgeItems: unknown[]): string;
  chatWithSystem(
    system: string,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }>;
}

export interface IInboundKnowledgeService {
  findPromptItems(orgId: string, agentId: string): Promise<unknown[]>;
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface InboundResult {
  conversationId: string;
  reply: string;
  agentId: string;
}

// ─── Routing rule condition matcher ───────────────────────────────────────────

/** Matches a routing rule's condition against the inbound message text. */
function matchesCondition(
  conditionType: string,
  conditionValue: unknown,
  text: string,
): boolean {
  if (conditionType === 'always') return true;
  if (conditionType === 'keyword') {
    const { keywords } = conditionValue as { keywords?: string[] };
    if (!Array.isArray(keywords) || keywords.length === 0) return false;
    return keywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
  }
  // user_attribute and others — Phase 2+
  return false;
}

// ─── InboundService ───────────────────────────────────────────────────────────

@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly channelsService: ChannelsService,
    private readonly channelConvService: ChannelConversationService,
    @Inject(INBOUND_AGENTS_SERVICE)
    private readonly agentsService: IInboundAgentsService,
    @Inject(INBOUND_CHAT_SERVICE)
    private readonly chatService: IInboundChatService,
    @Inject(INBOUND_KNOWLEDGE_SERVICE)
    private readonly knowledgeService: IInboundKnowledgeService,
  ) {}

  /**
   * Full inbound pipeline for channel webhook/trigger events.
   *
   *  1. Load + validate workspace channel
   *  2. Resolve adapter
   *  3. Parse inbound (HMAC/platform signature handled by adapter)
   *  4. Find matching routing rule (first-match by priority)
   *  5. Load agent + knowledge
   *  6. Find-or-create conversation
   *  7. Load message history
   *  8. Build composite system prompt
   *  9. LLM call
   * 10. Persist both turns
   * 11. Send reply via adapter
   */
  async handleInbound(
    channelId: string,
    rawBody: unknown,
    headers: Record<string, string>,
  ): Promise<InboundResult | null> {
    // 1. Load channel (throws 404 / 400 if inactive)
    const channelRow = await this.channelsService.findByIdPublic(channelId);

    // 2. Resolve adapter
    const adapter = resolveChannelAdapter(channelRow.channelType as ChannelType);

    // 3. Parse inbound — adapter verifies signature internally
    const inbound: InboundMessage | null = adapter.parseInbound(
      rawBody,
      channelRow.webhookSecret,
      (channelRow.config as Record<string, unknown>) ?? {},
    );

    if (!inbound) {
      // Challenge ping or no-op — return null; controller sends 200
      return null;
    }

    this.logger.log(
      `[inbound] channel=${channelId} type=${channelRow.channelType} from=${inbound.fromId}`,
    );

    // 4. Resolve routing rules (ordered by priority asc, first match wins)
    const rules = await this.channelsService.resolveRoutingRules(channelId);
    const matchedRule = rules.find((r) =>
      matchesCondition(r.conditionType, r.conditionValue, inbound.text),
    );

    if (!matchedRule) {
      this.logger.warn(`[inbound] no routing rule matched for channel=${channelId}`);
      return null;
    }

    // 5. Load agent + knowledge
    const agentRow = await this.agentsService.findOne(channelRow.orgId, matchedRule.agentId);
    const knowledgeItems = await this.knowledgeService.findPromptItems(
      channelRow.orgId,
      matchedRule.agentId,
    );

    // 6. Find or create conversation
    const { id: conversationId, isNew } = await this.channelConvService.findOrCreate(
      channelRow.orgId,
      channelId,
      matchedRule.agentId,
      inbound.fromId,
      inbound.threadRef,
    );

    // 7. Load history
    const history = await this.channelConvService.loadHistory(conversationId);

    // 8. Build composite system prompt
    let system = this.chatService.buildSystemPrompt(agentRow, knowledgeItems);
    if (channelRow.workspaceInstructions) {
      system += `\n\n[Workspace Instructions]\n${channelRow.workspaceInstructions}`;
    }
    if (matchedRule.agentInstructions) {
      system += `\n\n[Channel-Specific Instructions]\n${matchedRule.agentInstructions}`;
    }

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history,
      { role: 'user', content: inbound.text },
    ];

    // 9. LLM call
    this.logger.log(
      `[inbound] conv=${conversationId} agent=${matchedRule.agentId} messages=${messages.length}`,
    );
    const response = await this.chatService.chatWithSystem(system, messages);

    // 10. Persist both turns (isNew means history was empty — set title from first message)
    await this.channelConvService.saveMessages(
      conversationId,
      inbound.text,
      response.content,
      { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
      isNew,
    );

    // 11. Send reply via adapter (fire-and-forget; errors are logged but don't fail the request)
    try {
      await adapter.send(
        {
          text: response.content,
          threadRef: inbound.threadRef,
          conversationId,
        },
        (channelRow.config as Record<string, unknown>) ?? {},
      );
    } catch (err) {
      this.logger.warn(
        `[inbound] adapter.send failed (channel=${channelId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      conversationId,
      reply: response.content,
      agentId: matchedRule.agentId,
    };
  }
}
