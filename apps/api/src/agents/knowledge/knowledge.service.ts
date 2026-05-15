import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import type {
  UpdateKnowledgeItemDto,
  UpsertKnowledgeItemDto,
} from './dto/upsert-knowledge-item.dto';
import { KnowledgeSourcesService } from '../catalog/knowledge-sources.service';

export type KnowledgeItem = typeof schema.agentKnowledgeItems.$inferSelect;

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private db: DbClient,
    private readonly knowledgeSourcesService: KnowledgeSourcesService,
  ) {}

  private async ensureAgent(orgId: string, agentId: string) {
    const [row] = await this.db
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, agentId),
          eq(schema.agents.orgId, orgId),
          isNull(schema.agents.deletedAt),
        ),
      );

    if (!row) throw new NotFoundException(`Agent ${agentId} not found`);
    return row;
  }

  async findAll(orgId: string, agentId: string): Promise<KnowledgeItem[]> {
    await this.ensureAgent(orgId, agentId);

    return this.db
      .select()
      .from(schema.agentKnowledgeItems)
      .where(
        and(
          eq(schema.agentKnowledgeItems.orgId, orgId),
          eq(schema.agentKnowledgeItems.agentId, agentId),
        ),
      )
      .orderBy(asc(schema.agentKnowledgeItems.position), asc(schema.agentKnowledgeItems.createdAt));
  }

  async findPromptItems(orgId: string, agentId: string): Promise<KnowledgeItem[]> {
    await this.ensureAgent(orgId, agentId);

    const [items, selectedSources] = await Promise.all([
      this.findAll(orgId, agentId),
      this.knowledgeSourcesService.findSelections(orgId, agentId),
    ]);

    const selectedSourceIds = new Set(selectedSources.map((source) => source.id));
    return items.filter(
      (item) =>
        item.knowledgeSourceOptionId === null ||
        selectedSourceIds.has(item.knowledgeSourceOptionId),
    );
  }

  async create(
    orgId: string,
    agentId: string,
    dto: UpsertKnowledgeItemDto,
  ): Promise<KnowledgeItem> {
    await this.ensureAgent(orgId, agentId);

    const [row] = await this.db
      .insert(schema.agentKnowledgeItems)
      .values({
        orgId,
        agentId,
        type: dto.type,
        title: dto.title ?? null,
        question: dto.question ?? null,
        answer: dto.answer ?? null,
        content: dto.content ?? null,
        sourceUrl: dto.sourceUrl ?? null,
        knowledgeSourceOptionId: dto.knowledgeSourceOptionId ?? null,
        position: dto.position ?? 0,
      })
      .returning();

    return row;
  }

  async update(
    orgId: string,
    agentId: string,
    itemId: string,
    dto: UpdateKnowledgeItemDto,
  ): Promise<KnowledgeItem> {
    await this.ensureAgent(orgId, agentId);

    const [row] = await this.db
      .update(schema.agentKnowledgeItems)
      .set({
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.question !== undefined && { question: dto.question }),
        ...(dto.answer !== undefined && { answer: dto.answer }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.sourceUrl !== undefined && { sourceUrl: dto.sourceUrl }),
        ...(dto.knowledgeSourceOptionId !== undefined && {
          knowledgeSourceOptionId: dto.knowledgeSourceOptionId,
        }),
        ...(dto.position !== undefined && { position: dto.position }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agentKnowledgeItems.id, itemId),
          eq(schema.agentKnowledgeItems.orgId, orgId),
          eq(schema.agentKnowledgeItems.agentId, agentId),
        ),
      )
      .returning();

    if (!row) throw new NotFoundException(`Knowledge item ${itemId} not found`);
    return row;
  }

  async remove(orgId: string, agentId: string, itemId: string): Promise<void> {
    await this.ensureAgent(orgId, agentId);

    const [row] = await this.db
      .delete(schema.agentKnowledgeItems)
      .where(
        and(
          eq(schema.agentKnowledgeItems.id, itemId),
          eq(schema.agentKnowledgeItems.orgId, orgId),
          eq(schema.agentKnowledgeItems.agentId, agentId),
        ),
      )
      .returning({ id: schema.agentKnowledgeItems.id });

    if (!row) throw new NotFoundException(`Knowledge item ${itemId} not found`);
  }
}
