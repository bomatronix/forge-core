import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DRIZZLE_CLIENT, schema } from '@forge-core/core';
import type { DbClient } from '@forge-core/core';
import { resolveChannelAdapter, getChannelCatalog } from './channel-registry';
import type { ChannelType } from './adapters/channel.adapter';
import type { IChannelAdapter } from './adapters/channel.adapter';
import { encryptConfig, decryptConfig } from './crypto.util';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateChannelDto {
  channelType: ChannelType;
  name: string;
  config?: Record<string, unknown>;
  webhookSecret?: string;
  workspaceInstructions?: string;
}

export interface UpdateChannelDto {
  name?: string;
  config?: Record<string, unknown>;
  webhookSecret?: string;
  status?: 'active' | 'paused';
  workspaceInstructions?: string;
}

export interface UpsertRoutingRuleDto {
  priority?: number;
  conditionType: string;
  conditionValue?: Record<string, unknown>;
  agentId: string;
  agentInstructions?: string;
}

/** Payload for PUT /channels/:id/routing-rules (atomic full replace). */
export interface ReplaceRoutingRulesDto {
  rules: UpsertRoutingRuleDto[];
}

export interface ChannelRow {
  id: string;
  orgId: string;
  channelType: string;
  name: string;
  config: Record<string, unknown>;
  webhookSecret: string | null;
  status: string;
  workspaceInstructions: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoutingRuleRow {
  id: string;
  workspaceChannelId: string;
  orgId: string;
  priority: number;
  conditionType: string;
  conditionValue: Record<string, unknown>;
  agentId: string;
  agentInstructions: string | null;
  createdAt: string;
}

export interface ChannelCatalogItem {
  type: ChannelType;
  name: string;
  iconSlug: string;
  capabilities: string[];
  configSchema: Record<string, unknown>;
  setupInstructions: string;
}

interface WebsiteOriginCache {
  expiresAt: number;
  allowedDomains: Set<string>;
  domainsByOrgAndAgent: Map<string, Set<string>>;
}

const WEBSITE_ORIGIN_CACHE_TTL_MS = 30_000;

function websiteOriginCacheKey(orgId: string, agentId: string): string {
  return `${orgId}:${agentId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeAllowedDomain(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Allowed domains must be strings');
  }

  const domain = value.trim().toLowerCase();
  if (!domain) return '';

  if (domain.includes('://')) {
    throw new BadRequestException('Allowed domains must not include http:// or https://');
  }

  if (/[/?#\s]/.test(domain)) {
    throw new BadRequestException('Allowed domains must not include paths, queries, or spaces');
  }

  if (domain.includes('*')) {
    throw new BadRequestException('Allowed domains must list each domain or subdomain explicitly');
  }

  try {
    const parsed = new URL(`https://${domain}`);
    if (!parsed.hostname || parsed.host !== domain) {
      throw new Error('Host normalization mismatch');
    }
    return parsed.host;
  } catch {
    throw new BadRequestException(`Invalid allowed domain: ${value}`);
  }
}

export function normalizeAllowedDomains(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('allowedDomains must be an array of domain strings');
  }

  return Array.from(
    new Set(value.map(normalizeAllowedDomain).filter((domain) => domain.length > 0)),
  ).sort();
}

export function originToAllowedDomain(origin: string | undefined | null): string | null {
  if (!origin) return null;

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.host) return null;
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private websiteOriginCache: WebsiteOriginCache | null = null;

  constructor(@Inject(DRIZZLE_CLIENT) private readonly db: DbClient) {}

  // ─── Catalog ────────────────────────────────────────────────────────────────

  getCatalog(): ChannelCatalogItem[] {
    return getChannelCatalog().map((adapter: IChannelAdapter) => ({
      type: adapter.type,
      name: adapter.name,
      iconSlug: adapter.iconSlug,
      capabilities: adapter.capabilities,
      configSchema: adapter.configSchema,
      setupInstructions: adapter.setupInstructions,
    }));
  }

  // ─── Channel CRUD ───────────────────────────────────────────────────────────

  async findAll(orgId: string): Promise<ChannelRow[]> {
    const rows = await this.db
      .select()
      .from(schema.workspaceChannels)
      .where(eq(schema.workspaceChannels.orgId, orgId))
      .orderBy(asc(schema.workspaceChannels.createdAt));

    return rows.map(this.mapChannel);
  }

  async findOne(orgId: string, id: string): Promise<ChannelRow> {
    const [row] = await this.db
      .select()
      .from(schema.workspaceChannels)
      .where(and(eq(schema.workspaceChannels.id, id), eq(schema.workspaceChannels.orgId, orgId)));

    if (!row) throw new NotFoundException(`Channel ${id} not found`);
    return this.mapChannel(row);
  }

  /** Resolves and returns the raw DB row for internal use (includes credentials). */
  async findOneRaw(orgId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.workspaceChannels)
      .where(and(eq(schema.workspaceChannels.id, id), eq(schema.workspaceChannels.orgId, orgId)));

    if (!row) throw new NotFoundException(`Channel ${id} not found`);
    return { ...row, config: decryptConfig(row.config as Record<string, unknown>) };
  }

  /** Lookup by channel ID only — used by the public inbound endpoint (no orgId). */
  async findByIdPublic(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.workspaceChannels)
      .where(eq(schema.workspaceChannels.id, id));

    if (!row) throw new NotFoundException(`Channel ${id} not found`);
    if (row.status !== 'active') {
      throw new BadRequestException(`Channel ${id} is not active`);
    }
    return { ...row, config: decryptConfig(row.config as Record<string, unknown>) };
  }

  async create(orgId: string, dto: CreateChannelDto): Promise<ChannelRow> {
    // Validate the channel type resolves
    resolveChannelAdapter(dto.channelType);
    const config = this.normalizeConfigForStorage(dto.channelType, dto.config ?? {});

    const [row] = await this.db
      .insert(schema.workspaceChannels)
      .values({
        orgId,
        channelType: dto.channelType,
        name: dto.name,
        config: encryptConfig(config),
        webhookSecret: dto.webhookSecret ?? null,
        workspaceInstructions: dto.workspaceInstructions ?? null,
      })
      .returning();

    if (dto.channelType === 'website') this.invalidateWebsiteOriginCache();
    this.logger.log(`[create] org=${orgId} type=${dto.channelType} id=${row.id}`);
    return this.mapChannel(row);
  }

  async update(orgId: string, id: string, dto: UpdateChannelDto): Promise<ChannelRow> {
    const existing = await this.findOne(orgId, id); // 404 guard

    const updates: Partial<typeof schema.workspaceChannels.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.config !== undefined) {
      updates.config = encryptConfig(
        this.normalizeConfigForStorage(existing.channelType as ChannelType, dto.config),
      );
    }
    if (dto.webhookSecret !== undefined) updates.webhookSecret = dto.webhookSecret;
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.workspaceInstructions !== undefined)
      updates.workspaceInstructions = dto.workspaceInstructions;

    const [row] = await this.db
      .update(schema.workspaceChannels)
      .set(updates)
      .where(and(eq(schema.workspaceChannels.id, id), eq(schema.workspaceChannels.orgId, orgId)))
      .returning();

    if (existing.channelType === 'website') this.invalidateWebsiteOriginCache();
    return this.mapChannel(row);
  }

  async remove(orgId: string, id: string): Promise<void> {
    const existing = await this.findOne(orgId, id); // 404 guard

    await this.db
      .delete(schema.workspaceChannels)
      .where(and(eq(schema.workspaceChannels.id, id), eq(schema.workspaceChannels.orgId, orgId)));

    if (existing.channelType === 'website') this.invalidateWebsiteOriginCache();
  }

  // ─── Routing Rules ──────────────────────────────────────────────────────────

  async findRoutingRules(orgId: string, channelId: string): Promise<RoutingRuleRow[]> {
    await this.findOne(orgId, channelId); // 404 + org guard

    const rows = await this.db
      .select()
      .from(schema.channelRoutingRules)
      .where(eq(schema.channelRoutingRules.workspaceChannelId, channelId))
      .orderBy(asc(schema.channelRoutingRules.priority));

    return rows.map(this.mapRule);
  }

  async upsertRoutingRule(
    orgId: string,
    channelId: string,
    dto: UpsertRoutingRuleDto,
  ): Promise<RoutingRuleRow> {
    await this.findOne(orgId, channelId); // 404 + org guard

    const [row] = await this.db
      .insert(schema.channelRoutingRules)
      .values({
        workspaceChannelId: channelId,
        orgId,
        priority: dto.priority ?? 0,
        conditionType: dto.conditionType,
        conditionValue: dto.conditionValue ?? {},
        agentId: dto.agentId,
        agentInstructions: dto.agentInstructions ?? null,
      })
      .returning();

    return this.mapRule(row);
  }

  async deleteRoutingRule(orgId: string, channelId: string, ruleId: string): Promise<void> {
    await this.findOne(orgId, channelId); // org guard

    await this.db
      .delete(schema.channelRoutingRules)
      .where(
        and(
          eq(schema.channelRoutingRules.id, ruleId),
          eq(schema.channelRoutingRules.workspaceChannelId, channelId),
          eq(schema.channelRoutingRules.orgId, orgId),
        ),
      );
  }

  /**
   * Atomically replaces all routing rules for a channel.
   * Deletes existing rules then inserts the new set in a single transaction.
   */
  async replaceRoutingRules(
    orgId: string,
    channelId: string,
    dto: ReplaceRoutingRulesDto,
  ): Promise<RoutingRuleRow[]> {
    await this.findOne(orgId, channelId); // 404 + org guard

    return this.db.transaction(async (tx) => {
      // Delete all existing rules for this channel
      await tx
        .delete(schema.channelRoutingRules)
        .where(
          and(
            eq(schema.channelRoutingRules.workspaceChannelId, channelId),
            eq(schema.channelRoutingRules.orgId, orgId),
          ),
        );

      if (dto.rules.length === 0) return [];

      // Insert new rules
      const inserted = await tx
        .insert(schema.channelRoutingRules)
        .values(
          dto.rules.map((r, idx) => ({
            workspaceChannelId: channelId,
            orgId,
            priority: r.priority ?? idx,
            conditionType: r.conditionType,
            conditionValue: r.conditionValue ?? {},
            agentId: r.agentId,
            agentInstructions: r.agentInstructions ?? null,
          })),
        )
        .returning();

      return inserted.sort((a, b) => a.priority - b.priority).map(this.mapRule);
    });
  }

  /** Load routing rules ordered by priority — used internally by InboundService. */
  async resolveRoutingRules(channelId: string) {
    return this.db
      .select()
      .from(schema.channelRoutingRules)
      .where(eq(schema.channelRoutingRules.workspaceChannelId, channelId))
      .orderBy(asc(schema.channelRoutingRules.priority));
  }

  // ─── Validate ───────────────────────────────────────────────────────────────

  async validateConfig(orgId: string, id: string): Promise<{ ok: boolean; error?: string }> {
    const row = await this.findOneRaw(orgId, id);
    const adapter = resolveChannelAdapter(row.channelType as ChannelType);
    return adapter.validate(row.config as Record<string, unknown>);
  }

  async isCorsOriginAllowed(origin: string | undefined | null): Promise<boolean> {
    const domain = originToAllowedDomain(origin);
    if (!domain) return false;

    const cache = await this.getWebsiteOriginCache();
    return cache.allowedDomains.has(domain);
  }

  async isAgentOriginAllowed(
    orgId: string,
    agentId: string,
    origin: string | undefined | null,
  ): Promise<boolean> {
    if (!origin) return true;

    const domain = originToAllowedDomain(origin);
    if (!domain) return false;

    const cache = await this.getWebsiteOriginCache();
    return (
      cache.domainsByOrgAndAgent.get(websiteOriginCacheKey(orgId, agentId))?.has(domain) ?? false
    );
  }

  // ─── Mappers ────────────────────────────────────────────────────────────────

  private normalizeConfigForStorage(
    channelType: ChannelType,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!isObject(config)) {
      throw new BadRequestException('Channel config must be an object');
    }

    if (channelType !== 'website') return config;

    return {
      ...config,
      allowedDomains: normalizeAllowedDomains(config.allowedDomains),
    };
  }

  private invalidateWebsiteOriginCache(): void {
    this.websiteOriginCache = null;
  }

  private async getWebsiteOriginCache(): Promise<WebsiteOriginCache> {
    const now = Date.now();
    if (this.websiteOriginCache && this.websiteOriginCache.expiresAt > now) {
      return this.websiteOriginCache;
    }

    const rows = await this.db
      .select()
      .from(schema.workspaceChannels)
      .where(
        and(
          eq(schema.workspaceChannels.channelType, 'website'),
          eq(schema.workspaceChannels.status, 'active'),
        ),
      )
      .orderBy(asc(schema.workspaceChannels.updatedAt));

    const allowedDomains = new Set<string>();
    const domainsByOrgAndAgent = new Map<string, Set<string>>();

    for (const row of rows) {
      const config = decryptConfig(row.config as Record<string, unknown>);
      const orgId = row.orgId.trim();
      const agentId = typeof config.agentId === 'string' ? config.agentId.trim() : '';

      let domains: string[];
      try {
        domains = normalizeAllowedDomains(config.allowedDomains);
      } catch (err) {
        this.logger.warn(
          `[cors] ignoring invalid website channel domains channel=${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      for (const domain of domains) {
        allowedDomains.add(domain);
        if (!orgId || !agentId) continue;

        const key = websiteOriginCacheKey(orgId, agentId);
        const existing = domainsByOrgAndAgent.get(key) ?? new Set<string>();
        existing.add(domain);
        domainsByOrgAndAgent.set(key, existing);
      }
    }

    this.websiteOriginCache = {
      expiresAt: now + WEBSITE_ORIGIN_CACHE_TTL_MS,
      allowedDomains,
      domainsByOrgAndAgent,
    };

    return this.websiteOriginCache;
  }

  private mapChannel(row: typeof schema.workspaceChannels.$inferSelect): ChannelRow {
    return {
      id: row.id,
      orgId: row.orgId,
      channelType: row.channelType,
      name: row.name,
      config: decryptConfig(row.config as Record<string, unknown>),
      webhookSecret: row.webhookSecret,
      status: row.status,
      workspaceInstructions: row.workspaceInstructions,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapRule(row: typeof schema.channelRoutingRules.$inferSelect): RoutingRuleRow {
    return {
      id: row.id,
      workspaceChannelId: row.workspaceChannelId,
      orgId: row.orgId,
      priority: row.priority,
      conditionType: row.conditionType,
      conditionValue: row.conditionValue as Record<string, unknown>,
      agentId: row.agentId,
      agentInstructions: row.agentInstructions,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
