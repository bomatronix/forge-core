import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, ilike, isNull, or } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import type { Agent, AgentStatus } from '@forge-core/common';
import type { CreateAgentDto } from '@forge-core/common';
import type { UpdateAgentDto } from '@forge-core/common';
import type { UpdateStatusDto } from '@forge-core/common';
import { KnowledgeSourcesService } from './catalog/knowledge-sources.service';

const allowedStatusTransitions: Record<AgentStatus, AgentStatus[]> = {
  draft: ['live'],
  live: ['paused'],
  paused: ['live'],
};

interface AgentListFilters {
  search?: string;
  status?: AgentStatus;
  agentType?: string;
}

@Injectable()
export class AgentsService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private db: DbClient,
    private readonly knowledgeSourcesService: KnowledgeSourcesService,
  ) {}

  private generateShareToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private async ensureLiveShareToken(row: typeof schema.agents.$inferSelect) {
    if (row.status !== 'live' || row.shareToken) {
      return row;
    }

    const [updated] = await this.db
      .update(schema.agents)
      .set({
        shareToken: this.generateShareToken(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agents.id, row.id),
          eq(schema.agents.orgId, row.orgId),
          eq(schema.agents.status, 'live'),
          isNull(schema.agents.shareToken),
          isNull(schema.agents.deletedAt),
        ),
      )
      .returning();

    return updated ?? row;
  }

  private async findOneRow(orgId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, id),
          eq(schema.agents.orgId, orgId),
          isNull(schema.agents.deletedAt),
        ),
      );

    if (!row) throw new NotFoundException(`Agent ${id} not found`);
    return row;
  }

  private normalizeAgentType(agentType?: string | null): string {
    return agentType?.trim() || 'custom';
  }

  private async resolveAgentTypeSlug(orgId: string, dto: CreateAgentDto): Promise<string> {
    if (!dto.templateId) return this.normalizeAgentType(dto.agentType);

    const [template] = await this.db
      .select({
        agentTypeSlug: schema.agentTemplates.agentTypeSlug,
        category: schema.agentTemplates.category,
      })
      .from(schema.agentTemplates)
      .where(
        and(
          eq(schema.agentTemplates.slug, dto.templateId),
          eq(schema.agentTemplates.enabled, true),
          or(isNull(schema.agentTemplates.orgId), eq(schema.agentTemplates.orgId, orgId)),
        ),
      );

    return this.normalizeAgentType(template?.agentTypeSlug ?? template?.category ?? dto.agentType);
  }

  async list(orgId: string, filters: AgentListFilters = {}): Promise<Agent[]> {
    const conditions = [eq(schema.agents.orgId, orgId), isNull(schema.agents.deletedAt)];

    if (filters.status) {
      conditions.push(eq(schema.agents.status, filters.status));
    }

    if (filters.agentType && filters.agentType !== 'all') {
      conditions.push(eq(schema.agents.agentTypeSlug, filters.agentType));
    }

    if (filters.search?.trim()) {
      conditions.push(ilike(schema.agents.name, `%${filters.search.trim()}%`));
    }

    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(and(...conditions));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      agentType: row.agentTypeSlug,
      status: row.status as Agent['status'],
      channels:
        ((row.uiConfig as Record<string, unknown> | null)?.channels as Agent['channels']) ?? [],
      conversations: 0,
      resolution: null,
      csat: null,
    }));
  }

  async findOne(orgId: string, id: string) {
    const row = await this.findOneRow(orgId, id);
    return this.ensureLiveShareToken(row);
  }

  async findPublicLive(id: string, shareToken: string) {
    const token = shareToken.trim();
    if (!token) throw new NotFoundException('Agent not available');

    const [row] = await this.db
      .select()
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, id),
          eq(schema.agents.shareToken, token),
          eq(schema.agents.status, 'live'),
          isNull(schema.agents.deletedAt),
        ),
      );

    if (!row) throw new NotFoundException('Agent not available');
    return row;
  }

  async create(orgId: string, dto: CreateAgentDto) {
    const agentTypeSlug = await this.resolveAgentTypeSlug(orgId, dto);

    const [row] = await this.db
      .insert(schema.agents)
      .values({
        orgId,
        name: dto.name,
        templateId: dto.templateId ?? null,
        agentTypeSlug,
        uiConfig: dto.uiConfig ?? null,
        aiConfig: dto.aiConfig ?? null,
      })
      .returning();

    await this.knowledgeSourcesService.seedSelectionsForCreatedAgent(
      orgId,
      row.id,
      row.agentTypeSlug,
      dto.templateId,
      dto.knowledgeSourceSlugs,
    );

    return row;
  }

  async update(orgId: string, id: string, dto: UpdateAgentDto) {
    await this.findOneRow(orgId, id); // verify ownership

    const [row] = await this.db
      .update(schema.agents)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.agentType !== undefined && { agentTypeSlug: this.normalizeAgentType(dto.agentType) }),
        ...(dto.uiConfig !== undefined && { uiConfig: dto.uiConfig }),
        ...(dto.aiConfig !== undefined && { aiConfig: dto.aiConfig }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.agents.id, id), eq(schema.agents.orgId, orgId)))
      .returning();

    return row;
  }

  async updateStatus(orgId: string, id: string, dto: UpdateStatusDto) {
    const agent = await this.findOneRow(orgId, id); // verify ownership
    const currentStatus = agent.status as AgentStatus;

    if (!allowedStatusTransitions[currentStatus]?.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid agent status transition: ${currentStatus} -> ${dto.status}`,
      );
    }

    const [row] = await this.db
      .update(schema.agents)
      .set({
        status: dto.status,
        ...(dto.status === 'live' && !agent.shareToken
          ? { shareToken: this.generateShareToken() }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agents.id, id),
          eq(schema.agents.orgId, orgId),
          eq(schema.agents.status, currentStatus),
        ),
      )
      .returning();

    if (!row) {
      throw new ConflictException(
        `Agent ${id} status was modified concurrently — please retry`,
      );
    }

    return row;
  }

  async remove(orgId: string, id: string): Promise<void> {
    await this.findOneRow(orgId, id); // verify ownership

    await this.db
      .update(schema.agents)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.agents.id, id), eq(schema.agents.orgId, orgId)));
  }
}
