import type { schema } from '@forge-core/core';

export type KnowledgeSourceOptionRow = typeof schema.knowledgeSourceOptions.$inferSelect;
export type AgentTemplateRow = typeof schema.agentTemplates.$inferSelect;
export type AgentTypeRow = typeof schema.agentTypes.$inferSelect;

export interface AgentTypeDto {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  enabled: boolean;
  position: number;
}

export interface KnowledgeSourceUiSchema {
  setupMode?: 'qa' | 'document' | 'integration';
  integrationProvider?: string;
  [key: string]: unknown;
}

export interface KnowledgeSourceOptionDto {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  uiSchema: KnowledgeSourceUiSchema;
  enabled: boolean;
  position: number;
}

export interface AgentTemplateDto {
  id: string;
  name: string;
  emoji: string;
  category: string;
  agentType: string;
  description: string;
  identity: Record<string, unknown>;
  behaviour: Record<string, unknown>;
  actions: string[];
  channels: string[];
  knowledge: string[];
  knowledgeSourceSlugs: string[];
  knowledgeSources: KnowledgeSourceOptionDto[];
}

export function toAgentTypeDto(row: AgentTypeRow): AgentTypeDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    enabled: row.enabled,
    position: row.position,
  };
}

export function toKnowledgeSourceOptionDto(
  row: KnowledgeSourceOptionRow,
): KnowledgeSourceOptionDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    category: row.category,
    uiSchema: (row.uiSchema ?? {}) as KnowledgeSourceUiSchema,
    enabled: row.enabled,
    position: row.position,
  };
}
