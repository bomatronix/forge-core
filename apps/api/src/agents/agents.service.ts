import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DRIZZLE_CLIENT, DbClient, schema } from '@forge-core/core';
import type { Agent, AgentStatus } from '@forge-core/common';
import type { CreateAgentDto } from '@forge-core/common';
import type { UpdateAgentDto } from '@forge-core/common';
import type { UpdateStatusDto } from '@forge-core/common';

const allowedStatusTransitions: Record<AgentStatus, AgentStatus[]> = {
  draft: ['live'],
  live: ['paused'],
  paused: ['live'],
};

@Injectable()
export class AgentsService {
  constructor(@Inject(DRIZZLE_CLIENT) private db: DbClient) {}

  private generateShareToken(): string {
    return randomBytes(32).toString('base64url');
  }

  async list(orgId: string): Promise<Agent[]> {
    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(and(eq(schema.agents.orgId, orgId), isNull(schema.agents.deletedAt)));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as Agent['status'],
      channels:
        ((row.uiConfig as Record<string, unknown> | null)?.channels as Agent['channels']) ?? [],
      conversations: 0,
      resolution: null,
      csat: null,
    }));
  }

  async findOne(orgId: string, id: string) {
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
    const [row] = await this.db
      .insert(schema.agents)
      .values({
        orgId,
        name: dto.name,
        templateId: dto.templateId ?? null,
        uiConfig: dto.uiConfig ?? null,
        aiConfig: dto.aiConfig ?? null,
      })
      .returning();

    return row;
  }

  async update(orgId: string, id: string, dto: UpdateAgentDto) {
    await this.findOne(orgId, id); // verify ownership

    const [row] = await this.db
      .update(schema.agents)
      .set({
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.uiConfig !== undefined && { uiConfig: dto.uiConfig }),
        ...(dto.aiConfig !== undefined && { aiConfig: dto.aiConfig }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.agents.id, id), eq(schema.agents.orgId, orgId)))
      .returning();

    return row;
  }

  async updateStatus(orgId: string, id: string, dto: UpdateStatusDto) {
    const agent = await this.findOne(orgId, id); // verify ownership
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
    await this.findOne(orgId, id); // verify ownership

    await this.db
      .update(schema.agents)
      .set({ deletedAt: new Date() })
      .where(and(eq(schema.agents.id, id), eq(schema.agents.orgId, orgId)));
  }
}
