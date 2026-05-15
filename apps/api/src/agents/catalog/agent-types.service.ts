import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import { toAgentTypeDto, type AgentTypeDto, type AgentTypeRow } from './catalog.types';

@Injectable()
export class AgentTypesService {
  constructor(@Inject(DRIZZLE_CLIENT) private db: DbClient) {}

  private visibilityCondition(orgId: string) {
    return or(isNull(schema.agentTypes.orgId), eq(schema.agentTypes.orgId, orgId));
  }

  async list(orgId: string): Promise<AgentTypeDto[]> {
    const rows = await this.db
      .select()
      .from(schema.agentTypes)
      .where(and(eq(schema.agentTypes.enabled, true), this.visibilityCondition(orgId)))
      .orderBy(asc(schema.agentTypes.position), asc(schema.agentTypes.name));

    const bySlug = new Map<string, AgentTypeRow>();
    for (const row of rows) {
      const existing = bySlug.get(row.slug);
      if (!existing || row.orgId === orgId) {
        bySlug.set(row.slug, row);
      }
    }

    return [...bySlug.values()]
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map(toAgentTypeDto);
  }

  async findOne(orgId: string, slug: string): Promise<AgentTypeDto> {
    const rows = await this.list(orgId);
    const row = rows.find((agentType) => agentType.slug === slug);
    if (!row) throw new NotFoundException(`Agent type ${slug} not found`);
    return row;
  }
}
