import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import {
  toKnowledgeSourceOptionDto,
  type KnowledgeSourceOptionDto,
  type KnowledgeSourceOptionRow,
} from './catalog.types';

@Injectable()
export class KnowledgeSourcesService {
  constructor(@Inject(DRIZZLE_CLIENT) private db: DbClient) {}

  private visibilityCondition(orgId: string) {
    return or(
      isNull(schema.knowledgeSourceOptions.orgId),
      eq(schema.knowledgeSourceOptions.orgId, orgId),
    );
  }

  private async ensureAgent(orgId: string, agentId: string) {
    const [row] = await this.db
      .select({
        id: schema.agents.id,
        agentTypeSlug: schema.agents.agentTypeSlug,
      })
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

  async listOptions(
    orgId: string,
    agentTypeSlug?: string,
  ): Promise<KnowledgeSourceOptionDto[]> {
    if (agentTypeSlug) {
      return this.listOptionsForAgentType(orgId, agentTypeSlug);
    }

    const rows = await this.db
      .select()
      .from(schema.knowledgeSourceOptions)
      .where(
        and(eq(schema.knowledgeSourceOptions.enabled, true), this.visibilityCondition(orgId)),
      )
      .orderBy(
        asc(schema.knowledgeSourceOptions.position),
        asc(schema.knowledgeSourceOptions.name),
      );

    return rows.map(toKnowledgeSourceOptionDto);
  }

  async listOptionsForAgentType(
    orgId: string,
    agentTypeSlug: string,
  ): Promise<KnowledgeSourceOptionDto[]> {
    const normalizedAgentType = agentTypeSlug.trim();
    if (!normalizedAgentType) return [];

    const [overrideCatalog] = await this.db
      .select()
      .from(schema.orgAgentTypeKnowledgeCatalogs)
      .where(
        and(
          eq(schema.orgAgentTypeKnowledgeCatalogs.orgId, orgId),
          eq(schema.orgAgentTypeKnowledgeCatalogs.agentTypeSlug, normalizedAgentType),
        ),
      );

    if (overrideCatalog) {
      const links = await this.db
        .select()
        .from(schema.orgAgentTypeKnowledgeSources)
        .where(eq(schema.orgAgentTypeKnowledgeSources.catalogId, overrideCatalog.id))
        .orderBy(asc(schema.orgAgentTypeKnowledgeSources.position));

      return this.optionsFromOrderedIds(
        orgId,
        links.map((link) => link.knowledgeSourceOptionId),
      );
    }

    const links = await this.db
      .select()
      .from(schema.knowledgeSourceOptionAgentTypes)
      .where(eq(schema.knowledgeSourceOptionAgentTypes.agentTypeSlug, normalizedAgentType))
      .orderBy(asc(schema.knowledgeSourceOptionAgentTypes.position));

    return this.optionsFromOrderedIds(
      orgId,
      links.map((link) => link.knowledgeSourceOptionId),
    );
  }

  async updateAgentTypeOptions(
    orgId: string,
    agentTypeSlug: string,
    sourceSlugs: string[] = [],
  ): Promise<KnowledgeSourceOptionDto[]> {
    const normalizedAgentType = agentTypeSlug.trim();
    if (!normalizedAgentType) throw new BadRequestException('Agent type is required');

    const uniqueSlugs = this.uniqueSlugs(sourceSlugs);
    const orderedOptions = await this.findVisibleOptionsBySlugs(orgId, uniqueSlugs);
    this.assertAllSlugsResolved(uniqueSlugs, orderedOptions);

    const [existingCatalog] = await this.db
      .select()
      .from(schema.orgAgentTypeKnowledgeCatalogs)
      .where(
        and(
          eq(schema.orgAgentTypeKnowledgeCatalogs.orgId, orgId),
          eq(schema.orgAgentTypeKnowledgeCatalogs.agentTypeSlug, normalizedAgentType),
        ),
      );

    const catalog =
      existingCatalog ??
      (
        await this.db
          .insert(schema.orgAgentTypeKnowledgeCatalogs)
          .values({
            orgId,
            agentTypeSlug: normalizedAgentType,
          })
          .returning()
      )[0];

    if (!catalog) throw new BadRequestException('Unable to create agent type catalog');

    await this.db
      .delete(schema.orgAgentTypeKnowledgeSources)
      .where(eq(schema.orgAgentTypeKnowledgeSources.catalogId, catalog.id));

    if (orderedOptions.length > 0) {
      await this.db.insert(schema.orgAgentTypeKnowledgeSources).values(
        orderedOptions.map((option, position) => ({
          catalogId: catalog.id,
          knowledgeSourceOptionId: option.id,
          position,
        })),
      );
    }

    return orderedOptions.map(toKnowledgeSourceOptionDto);
  }

  async findSelections(orgId: string, agentId: string): Promise<KnowledgeSourceOptionDto[]> {
    const agent = await this.ensureAgent(orgId, agentId);

    const selections = await this.db
      .select()
      .from(schema.agentKnowledgeSourceSelections)
      .where(
        and(
          eq(schema.agentKnowledgeSourceSelections.orgId, orgId),
          eq(schema.agentKnowledgeSourceSelections.agentId, agentId),
        ),
      )
      .orderBy(asc(schema.agentKnowledgeSourceSelections.position));

    if (selections.length === 0) return [];

    const allowedOptions = await this.listOptionsForAgentType(orgId, agent.agentTypeSlug);
    const allowedIds = new Set(allowedOptions.map((option) => option.id));
    const options = await this.optionsFromOrderedIds(
      orgId,
      selections
        .map((selection) => selection.knowledgeSourceOptionId)
        .filter((sourceId) => allowedIds.has(sourceId)),
    );
    const byId = new Map(options.map((option) => [option.id, option]));
    return selections
      .map((selection) => byId.get(selection.knowledgeSourceOptionId))
      .filter((option): option is KnowledgeSourceOptionDto => Boolean(option));
  }

  async updateSelections(
    orgId: string,
    agentId: string,
    sourceSlugs: string[] = [],
  ): Promise<KnowledgeSourceOptionDto[]> {
    const agent = await this.ensureAgent(orgId, agentId);

    const uniqueSlugs = this.uniqueSlugs(sourceSlugs);
    const allowedOptions = await this.listOptionsForAgentType(orgId, agent.agentTypeSlug);
    const allowedBySlug = new Map(allowedOptions.map((option) => [option.slug, option]));
    const missingSlugs = uniqueSlugs.filter((slug) => !allowedBySlug.has(slug));
    if (missingSlugs.length > 0) {
      throw new BadRequestException(
        `Knowledge source not available for ${agent.agentTypeSlug}: ${missingSlugs.join(', ')}`,
      );
    }
    const orderedOptions = uniqueSlugs
      .map((slug) => allowedBySlug.get(slug))
      .filter((option): option is KnowledgeSourceOptionDto => Boolean(option));

    await this.db
      .delete(schema.agentKnowledgeSourceSelections)
      .where(
        and(
          eq(schema.agentKnowledgeSourceSelections.orgId, orgId),
          eq(schema.agentKnowledgeSourceSelections.agentId, agentId),
        ),
      );

    if (orderedOptions.length > 0) {
      await this.db.insert(schema.agentKnowledgeSourceSelections).values(
        orderedOptions.map((option, position) => ({
          orgId,
          agentId,
          knowledgeSourceOptionId: option.id,
          position,
        })),
      );
    }

    return orderedOptions;
  }

  async seedSelectionsForCreatedAgent(
    orgId: string,
    agentId: string,
    agentTypeSlug: string,
    templateSlug?: string,
    sourceSlugs?: string[],
  ): Promise<void> {
    if (sourceSlugs !== undefined) {
      await this.insertSelectionsForSlugs(orgId, agentId, agentTypeSlug, sourceSlugs);
      return;
    }

    if (!templateSlug) return;

    const [template] = await this.db
      .select({ id: schema.agentTemplates.id })
      .from(schema.agentTemplates)
      .where(
        and(
          eq(schema.agentTemplates.slug, templateSlug),
          eq(schema.agentTemplates.enabled, true),
          or(isNull(schema.agentTemplates.orgId), eq(schema.agentTemplates.orgId, orgId)),
        ),
      );

    if (!template) return;

    const links = await this.db
      .select()
      .from(schema.agentTemplateKnowledgeSources)
      .where(eq(schema.agentTemplateKnowledgeSources.templateId, template.id))
      .orderBy(asc(schema.agentTemplateKnowledgeSources.position));

    if (links.length === 0) return;

    const allowedOptions = await this.listOptionsForAgentType(orgId, agentTypeSlug);
    const allowedIds = new Set(allowedOptions.map((option) => option.id));
    const filteredLinks = links.filter((link) => allowedIds.has(link.knowledgeSourceOptionId));
    if (filteredLinks.length === 0) return;

    await this.db.insert(schema.agentKnowledgeSourceSelections).values(
      filteredLinks.map((link, position) => ({
        orgId,
        agentId,
        knowledgeSourceOptionId: link.knowledgeSourceOptionId,
        position,
      })),
    );
  }

  private async insertSelectionsForSlugs(
    orgId: string,
    agentId: string,
    agentTypeSlug: string,
    sourceSlugs: string[],
  ): Promise<void> {
    const uniqueSlugs = this.uniqueSlugs(sourceSlugs);
    if (uniqueSlugs.length === 0) return;

    const allowedOptions = await this.listOptionsForAgentType(orgId, agentTypeSlug);
    const allowedBySlug = new Map(allowedOptions.map((option) => [option.slug, option]));
    const missingSlugs = uniqueSlugs.filter((slug) => !allowedBySlug.has(slug));
    if (missingSlugs.length > 0) {
      throw new BadRequestException(
        `Knowledge source not available for ${agentTypeSlug}: ${missingSlugs.join(', ')}`,
      );
    }
    const orderedOptions = uniqueSlugs
      .map((slug) => allowedBySlug.get(slug))
      .filter((option): option is KnowledgeSourceOptionDto => Boolean(option));

    if (orderedOptions.length === 0) return;

    await this.db.insert(schema.agentKnowledgeSourceSelections).values(
      orderedOptions.map((option, position) => ({
        orgId,
        agentId,
        knowledgeSourceOptionId: option.id,
        position,
      })),
      );
  }

  private async optionsFromOrderedIds(
    orgId: string,
    sourceIds: string[],
  ): Promise<KnowledgeSourceOptionDto[]> {
    const uniqueIds = [...new Set(sourceIds)];
    if (uniqueIds.length === 0) return [];

    const options = await this.db
      .select()
      .from(schema.knowledgeSourceOptions)
      .where(
        and(
          inArray(schema.knowledgeSourceOptions.id, uniqueIds),
          eq(schema.knowledgeSourceOptions.enabled, true),
          this.visibilityCondition(orgId),
        ),
      );

    const byId = new Map(options.map((option) => [option.id, toKnowledgeSourceOptionDto(option)]));
    return sourceIds
      .map((sourceId) => byId.get(sourceId))
      .filter((option): option is KnowledgeSourceOptionDto => Boolean(option));
  }

  private async findVisibleOptionsBySlugs(
    orgId: string,
    sourceSlugs: string[],
  ): Promise<KnowledgeSourceOptionRow[]> {
    if (sourceSlugs.length === 0) return [];

    return this.db
      .select()
      .from(schema.knowledgeSourceOptions)
      .where(
        and(
          inArray(schema.knowledgeSourceOptions.slug, sourceSlugs),
          eq(schema.knowledgeSourceOptions.enabled, true),
          this.visibilityCondition(orgId),
        ),
      );
  }

  private uniqueSlugs(sourceSlugs: string[]): string[] {
    return [...new Set(sourceSlugs.map((slug) => slug.trim()).filter(Boolean))];
  }

  private assertAllSlugsResolved(
    sourceSlugs: string[],
    options: KnowledgeSourceOptionRow[],
  ): void {
    const foundSlugs = new Set(options.map((option) => option.slug));
    const missingSlugs = sourceSlugs.filter((slug) => !foundSlugs.has(slug));
    if (missingSlugs.length > 0) {
      throw new BadRequestException(`Unknown knowledge source: ${missingSlugs.join(', ')}`);
    }
  }
}
