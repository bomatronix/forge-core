import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import {
  toKnowledgeSourceOptionDto,
  type AgentTemplateDto,
  type AgentTemplateRow,
  type KnowledgeSourceOptionRow,
} from './catalog.types';
import { KnowledgeSourcesService } from './knowledge-sources.service';

@Injectable()
export class AgentTemplatesService {
  constructor(
    @Inject(DRIZZLE_CLIENT) private db: DbClient,
    private readonly knowledgeSourcesService: KnowledgeSourcesService,
  ) {}

  async list(orgId: string, category?: string): Promise<AgentTemplateDto[]> {
    const conditions = [
      eq(schema.agentTemplates.enabled, true),
      or(isNull(schema.agentTemplates.orgId), eq(schema.agentTemplates.orgId, orgId)),
    ];

    if (category && category !== 'all') {
      conditions.push(inArray(schema.agentTemplates.agentTypeSlug, [category, 'custom']));
    }

    const rows = await this.db
      .select()
      .from(schema.agentTemplates)
      .where(and(...conditions))
      .orderBy(asc(schema.agentTemplates.position), asc(schema.agentTemplates.name));

    return Promise.all(rows.map((row) => this.toTemplateDto(orgId, row)));
  }

  async findOne(orgId: string, slug: string): Promise<AgentTemplateDto> {
    const [row] = await this.db
      .select()
      .from(schema.agentTemplates)
      .where(
        and(
          eq(schema.agentTemplates.slug, slug),
          eq(schema.agentTemplates.enabled, true),
          or(isNull(schema.agentTemplates.orgId), eq(schema.agentTemplates.orgId, orgId)),
        ),
      );

    if (!row) throw new NotFoundException(`Template ${slug} not found`);

    return this.toTemplateDto(orgId, row);
  }

  private async toTemplateDto(orgId: string, row: AgentTemplateRow): Promise<AgentTemplateDto> {
    const agentType = row.agentTypeSlug || row.category || 'custom';
    const knowledgeSources = await this.findKnowledgeSources(orgId, row.id, agentType);

    return {
      id: row.slug,
      name: row.name,
      emoji: row.emoji,
      category: row.category,
      agentType,
      description: row.description,
      identity: (row.identity ?? {}) as Record<string, unknown>,
      behaviour: (row.behaviour ?? {}) as Record<string, unknown>,
      actions: Array.isArray(row.actions) ? (row.actions as string[]) : [],
      channels: Array.isArray(row.channels) ? (row.channels as string[]) : [],
      knowledge: knowledgeSources.map((source) => source.slug),
      knowledgeSourceSlugs: knowledgeSources.map((source) => source.slug),
      knowledgeSources: knowledgeSources.map(toKnowledgeSourceOptionDto),
    };
  }

  private async findKnowledgeSources(
    orgId: string,
    templateId: string,
    agentType: string,
  ): Promise<KnowledgeSourceOptionRow[]> {
    const links = await this.db
      .select()
      .from(schema.agentTemplateKnowledgeSources)
      .where(eq(schema.agentTemplateKnowledgeSources.templateId, templateId))
      .orderBy(asc(schema.agentTemplateKnowledgeSources.position));

    if (links.length === 0) return [];

    const optionIds = links.map((link) => link.knowledgeSourceOptionId);
    const allowedSources = await this.knowledgeSourcesService.listOptionsForAgentType(
      orgId,
      agentType,
    );
    const allowedIds = new Set(allowedSources.map((source) => source.id));
    const options = await this.db
      .select()
      .from(schema.knowledgeSourceOptions)
      .where(
        and(
          inArray(schema.knowledgeSourceOptions.id, optionIds),
          eq(schema.knowledgeSourceOptions.enabled, true),
          or(
            isNull(schema.knowledgeSourceOptions.orgId),
            eq(schema.knowledgeSourceOptions.orgId, orgId),
          ),
        ),
      );

    const byId = new Map(options.map((option) => [option.id, option]));
    return links
      .map((link) => byId.get(link.knowledgeSourceOptionId))
      .filter(
        (option): option is KnowledgeSourceOptionRow =>
          option !== undefined && allowedIds.has(option.id),
      );
  }
}
