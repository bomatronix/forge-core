import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE_CLIENT, schema } from '@forge-core/core';
import type { DbClient } from '@forge-core/core';
import { AgentsService } from '../agents.service';
import { ChatService, type ChatResponse } from '../chat/chat.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ConversationWithMessages extends ConversationSummary {
  agentId: string;
  messages: ConversationMessage[];
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @Inject(DRIZZLE_CLIENT) private readonly db: DbClient,
    private readonly agentsService: AgentsService,
    private readonly chatService: ChatService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async create(orgId: string, agentId: string): Promise<{ id: string; createdAt: string }> {
    // Verify agent belongs to org
    await this.agentsService.findOne(orgId, agentId);

    const [row] = await this.db
      .insert(schema.conversations)
      .values({ orgId, agentId })
      .returning({ id: schema.conversations.id, createdAt: schema.conversations.createdAt });

    return { id: row.id, createdAt: row.createdAt.toISOString() };
  }

  async findAll(orgId: string, agentId: string, page = 1): Promise<ConversationSummary[]> {
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const rows = await this.db
      .select({
        id: schema.conversations.id,
        title: schema.conversations.title,
        createdAt: schema.conversations.createdAt,
        updatedAt: schema.conversations.updatedAt,
      })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.orgId, orgId),
          eq(schema.conversations.agentId, agentId),
          isNull(schema.conversations.workspaceChannelId), // in-app only
          isNull(schema.conversations.deletedAt),
        ),
      )
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(pageSize)
      .offset(offset);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async findOne(
    orgId: string,
    agentId: string,
    convId: string,
  ): Promise<ConversationWithMessages> {
    const [conv] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, convId),
          eq(schema.conversations.orgId, orgId),
          eq(schema.conversations.agentId, agentId),
          isNull(schema.conversations.deletedAt),
        ),
      );

    if (!conv) throw new NotFoundException(`Conversation ${convId} not found`);

    const messages = await this.db
      .select()
      .from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.conversationId, convId))
      .orderBy(asc(schema.conversationMessages.createdAt));

    return {
      id: conv.id,
      agentId: conv.agentId,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: (m.metadata as Record<string, unknown>) ?? {},
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async chat(
    orgId: string,
    agentId: string,
    convId: string,
    userMessage: string,
  ): Promise<ChatResponse> {
    const row = await this.agentsService.findOne(orgId, agentId);
    const knowledgeItems = await this.knowledgeService.findPromptItems(orgId, agentId);

    const [conv] = await this.db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, convId),
          eq(schema.conversations.orgId, orgId),
          eq(schema.conversations.agentId, agentId),
          isNull(schema.conversations.deletedAt),
        ),
      );

    if (!conv) throw new NotFoundException(`Conversation ${convId} not found`);

    // Load prior messages
    const prior = await this.db
      .select({ role: schema.conversationMessages.role, content: schema.conversationMessages.content })
      .from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.conversationId, convId))
      .orderBy(asc(schema.conversationMessages.createdAt));

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...prior.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const system = this.chatService.buildSystemPrompt(row, knowledgeItems);

    this.logger.log(
      `[conversations.chat] org=${orgId} agent=${agentId} conv=${convId} messages=${messages.length}`,
    );

    const response = await this.chatService.chatWithSystem(system, messages);

    // Persist both turns + update conversation atomically
    const isFirstMessage = prior.length === 0;
    const autoTitle = isFirstMessage ? userMessage.slice(0, 60) : undefined;

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.conversationMessages).values([
        {
          conversationId: convId,
          role: 'user',
          content: userMessage,
          metadata: {},
        },
        {
          conversationId: convId,
          role: 'assistant',
          content: response.content,
          metadata: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
        },
      ]);

      await tx
        .update(schema.conversations)
        .set({
          updatedAt: new Date(),
          ...(autoTitle ? { title: autoTitle } : {}),
        })
        .where(eq(schema.conversations.id, convId));
    });

    return response;
  }

  async remove(orgId: string, agentId: string, convId: string): Promise<void> {
    const [conv] = await this.db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, convId),
          eq(schema.conversations.orgId, orgId),
          eq(schema.conversations.agentId, agentId),
          isNull(schema.conversations.deletedAt),
        ),
      );

    if (!conv) throw new NotFoundException(`Conversation ${convId} not found`);

    await this.db
      .update(schema.conversations)
      .set({ deletedAt: new Date() })
      .where(eq(schema.conversations.id, convId));
  }
}
