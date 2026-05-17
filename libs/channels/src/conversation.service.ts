import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { DRIZZLE_CLIENT, schema } from '@forge-core/core';
import type { DbClient } from '@forge-core/core';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChannelConversationSummary {
  id: string;
  orgId: string;
  agentId: string;
  workspaceChannelId: string;
  title: string | null;
  externalUserRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConversationMessage {
  id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Manages conversation persistence for channel-originated messages.
 * Only used by InboundService — not exposed in the channels API.
 */
@Injectable()
export class ChannelConversationService {
  private readonly logger = new Logger(ChannelConversationService.name);

  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DbClient) {}

  /**
   * Finds an existing open conversation for the (channelId, agentId, externalUserRef) tuple,
   * or creates a new one if none exists.
   * externalThreadRef — Slack thread_ts, email thread ID etc. — used when provided.
   *
   * Uses INSERT … ON CONFLICT DO NOTHING to avoid the TOCTOU race between
   * concurrent webhook events for the same user. The unique partial index
   * conversations_channel_user_open_unique_idx enforces the constraint at DB level.
   */
  async findOrCreate(
    orgId: string,
    workspaceChannelId: string,
    agentId: string,
    externalUserRef: string,
    externalThreadRef?: string,
  ): Promise<{ id: string; isNew: boolean }> {
    // Attempt atomic insert first — succeeds when no open conversation exists
    const [created] = await this.db
      .insert(schema.conversations)
      .values({
        orgId,
        agentId,
        workspaceChannelId,
        externalUserRef,
        externalThreadRef: externalThreadRef ?? null,
        status: 'open',
      })
      .onConflictDoNothing()
      .returning({ id: schema.conversations.id });

    if (created) {
      this.logger.log(
        `[findOrCreate] new conversation=${created.id} channel=${workspaceChannelId} user=${externalUserRef}`,
      );
      return { id: created.id, isNew: true };
    }

    // Conflict: concurrent request created it — SELECT the existing row
    const [existing] = await this.db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.orgId, orgId),
          eq(schema.conversations.agentId, agentId),
          isNotNull(schema.conversations.workspaceChannelId),
          eq(schema.conversations.workspaceChannelId, workspaceChannelId),
          eq(schema.conversations.externalUserRef, externalUserRef),
          eq(schema.conversations.status, 'open'),
        ),
      )
      .limit(1);

    return { id: existing.id, isNew: false };
  }

  /** Load ordered message history for an LLM context window. */
  async loadHistory(conversationId: string): Promise<HistoryMessage[]> {
    const rows = await this.db
      .select({
        role: schema.conversationMessages.role,
        content: schema.conversationMessages.content,
      })
      .from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.conversationId, conversationId))
      .orderBy(asc(schema.conversationMessages.createdAt));

    return rows as HistoryMessage[];
  }

  /**
   * Returns paginated channel-scoped conversations.
   * Used by GET /channels/:id/conversations.
   */
  async findByChannel(
    orgId: string,
    channelId: string,
    page = 1,
  ): Promise<{ data: ChannelConversationSummary[]; total: number }> {
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    const where = and(
      eq(schema.conversations.orgId, orgId),
      eq(schema.conversations.workspaceChannelId, channelId),
      isNotNull(schema.conversations.workspaceChannelId),
    );

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.conversations)
      .where(where);

    const rows = await this.db
      .select({
        id: schema.conversations.id,
        orgId: schema.conversations.orgId,
        agentId: schema.conversations.agentId,
        title: schema.conversations.title,
        externalUserRef: schema.conversations.externalUserRef,
        createdAt: schema.conversations.createdAt,
        updatedAt: schema.conversations.updatedAt,
      })
      .from(schema.conversations)
      .where(where)
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(pageSize)
      .offset(offset);

    return {
      data: rows.map((r) => ({
        id: r.id,
        orgId: r.orgId,
        agentId: r.agentId,
        workspaceChannelId: channelId,
        title: r.title,
        externalUserRef: r.externalUserRef,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
    };
  }

  /**
   * Returns all messages for a conversation (ordered oldest-first).
   * Used by GET /channels/conversations/:convId/messages.
   */
  async findMessagesByConversation(
    orgId: string,
    convId: string,
  ): Promise<ChannelConversationMessage[]> {
    // Verify the conversation belongs to this org (and is a channel conversation)
    const [conv] = await this.db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.id, convId),
          eq(schema.conversations.orgId, orgId),
          isNotNull(schema.conversations.workspaceChannelId),
        ),
      )
      .limit(1);

    if (!conv) {
      return [];
    }

    const rows = await this.db
      .select({
        id: schema.conversationMessages.id,
        role: schema.conversationMessages.role,
        content: schema.conversationMessages.content,
        metadata: schema.conversationMessages.metadata,
        createdAt: schema.conversationMessages.createdAt,
      })
      .from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.conversationId, convId))
      .orderBy(asc(schema.conversationMessages.createdAt));

    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Persist user + assistant turn and update conversation metadata.
   *
   * @param isFirstMessage — pass `true` when history was empty before this call.
   *   Skips a SELECT round-trip by letting the caller track first-message state.
   */
  async saveMessages(
    conversationId: string,
    userContent: string,
    assistantContent: string,
    metadata?: Record<string, unknown>,
    isFirstMessage = false,
  ): Promise<void> {
    await this.db.insert(schema.conversationMessages).values([
      {
        conversationId,
        role: 'user',
        content: userContent,
        metadata: {},
      },
      {
        conversationId,
        role: 'assistant',
        content: assistantContent,
        metadata: metadata ?? {},
      },
    ]);

    const conversationUpdate = isFirstMessage
      ? { title: userContent.slice(0, 60).replace(/\n/g, ' '), updatedAt: new Date() }
      : { updatedAt: new Date() };

    await this.db
      .update(schema.conversations)
      .set(conversationUpdate)
      .where(eq(schema.conversations.id, conversationId));
  }
}
