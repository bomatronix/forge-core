/**
 * Drizzle schema — single source of truth for all database tables.
 * Add tables here as features are built in spec-03+.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const agentTypes = pgTable(
  'agent_types',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    scope: text('scope').notNull().default('global'),
    orgId: text('org_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    description: text('description').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex('agent_types_scope_slug_idx').on(t.scope, t.slug),
    index('agent_types_org_idx').on(t.orgId),
    index('agent_types_enabled_position_idx').on(t.enabled, t.position),
  ],
);

export const agents = pgTable(
  'agents',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: text('org_id').notNull(), // Clerk org_id from JWT — white-label operator
    workspaceId: text('workspace_id'), // nullable — future white-label client scope
    name: text('name').notNull(),
    status: text('status').notNull().default('draft'), // 'draft' | 'live' | 'paused'
    templateId: text('template_id'),
    agentTypeSlug: text('agent_type_slug').notNull().default('custom'),
    uiConfig: jsonb('ui_config'), // frontend-owned: identity, behaviour, channels
    aiConfig: jsonb('ai_config'), // forge-core-ai-owned: model tier, RAG, tools
    shareToken: text('share_token'), // nullable, unique — spec-08 public chat link
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
    deletedAt: timestamp('deleted_at'), // nullable — soft delete
  },
  (t) => [
    index('agents_org_id_idx').on(t.orgId),
    index('agents_org_workspace_status_idx').on(t.orgId, t.workspaceId, t.status),
    index('agents_org_agent_type_idx').on(t.orgId, t.agentTypeSlug),
    uniqueIndex('agents_share_token_idx').on(t.shareToken),
  ],
);

export const agentUsageEvents = pgTable(
  'agent_usage_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: text('org_id').notNull(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'public' | 'builder_test'
    eventType: text('event_type').notNull(), // 'chat_message'
    messageCount: integer('message_count').notNull().default(1),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('agent_usage_events_org_created_idx').on(t.orgId, t.createdAt),
    index('agent_usage_events_org_agent_idx').on(t.orgId, t.agentId),
  ],
);

export const knowledgeSourceOptions = pgTable(
  'knowledge_source_options',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    scope: text('scope').notNull().default('global'),
    orgId: text('org_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull().default('general'),
    uiSchema: jsonb('ui_schema').notNull().default(sql`'{}'::jsonb`),
    enabled: boolean('enabled').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex('knowledge_source_options_scope_slug_idx').on(t.scope, t.slug),
    index('knowledge_source_options_org_idx').on(t.orgId),
    index('knowledge_source_options_enabled_position_idx').on(t.enabled, t.position),
  ],
);

export const agentKnowledgeItems = pgTable(
  'agent_knowledge_items',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: text('org_id').notNull(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'qa' | 'document' | 'shopify_product'
    title: text('title'),
    question: text('question'),
    answer: text('answer'),
    content: text('content'),
    sourceUrl: text('source_url'),
    knowledgeSourceOptionId: uuid('knowledge_source_option_id').references(
      () => knowledgeSourceOptions.id,
      { onDelete: 'set null' },
    ),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index('agent_knowledge_items_agent_id_idx').on(t.agentId),
    index('agent_knowledge_items_org_agent_idx').on(t.orgId, t.agentId),
    index('agent_knowledge_items_source_idx').on(t.knowledgeSourceOptionId),
  ],
);

export const agentTemplates = pgTable(
  'agent_templates',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    scope: text('scope').notNull().default('global'),
    orgId: text('org_id'),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    emoji: text('emoji').notNull(),
    category: text('category').notNull(),
    agentTypeSlug: text('agent_type_slug').notNull().default('custom'),
    description: text('description').notNull(),
    identity: jsonb('identity').notNull(),
    behaviour: jsonb('behaviour').notNull(),
    actions: jsonb('actions').notNull().default(sql`'[]'::jsonb`),
    channels: jsonb('channels').notNull().default(sql`'[]'::jsonb`),
    enabled: boolean('enabled').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex('agent_templates_scope_slug_idx').on(t.scope, t.slug),
    index('agent_templates_org_idx').on(t.orgId),
    index('agent_templates_category_idx').on(t.category),
    index('agent_templates_agent_type_idx').on(t.agentTypeSlug),
    index('agent_templates_enabled_position_idx').on(t.enabled, t.position),
  ],
);

export const knowledgeSourceOptionAgentTypes = pgTable(
  'knowledge_source_option_agent_types',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    knowledgeSourceOptionId: uuid('knowledge_source_option_id')
      .notNull()
      .references(() => knowledgeSourceOptions.id, { onDelete: 'cascade' }),
    agentTypeSlug: text('agent_type_slug').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    uniqueIndex('knowledge_source_option_agent_types_unique_idx').on(
      t.knowledgeSourceOptionId,
      t.agentTypeSlug,
    ),
    index('knowledge_source_option_agent_types_type_idx').on(t.agentTypeSlug, t.position),
    index('knowledge_source_option_agent_types_source_idx').on(t.knowledgeSourceOptionId),
  ],
);

export const orgAgentTypeKnowledgeCatalogs = pgTable(
  'org_agent_type_knowledge_catalogs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: text('org_id').notNull(),
    agentTypeSlug: text('agent_type_slug').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex('org_agent_type_knowledge_catalogs_unique_idx').on(t.orgId, t.agentTypeSlug),
    index('org_agent_type_knowledge_catalogs_org_idx').on(t.orgId),
  ],
);

export const orgAgentTypeKnowledgeSources = pgTable(
  'org_agent_type_knowledge_sources',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    catalogId: uuid('catalog_id')
      .notNull()
      .references(() => orgAgentTypeKnowledgeCatalogs.id, { onDelete: 'cascade' }),
    knowledgeSourceOptionId: uuid('knowledge_source_option_id')
      .notNull()
      .references(() => knowledgeSourceOptions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    uniqueIndex('org_agent_type_knowledge_sources_unique_idx').on(
      t.catalogId,
      t.knowledgeSourceOptionId,
    ),
    index('org_agent_type_knowledge_sources_catalog_idx').on(t.catalogId, t.position),
  ],
);

export const agentTemplateKnowledgeSources = pgTable(
  'agent_template_knowledge_sources',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    templateId: uuid('template_id')
      .notNull()
      .references(() => agentTemplates.id, { onDelete: 'cascade' }),
    knowledgeSourceOptionId: uuid('knowledge_source_option_id')
      .notNull()
      .references(() => knowledgeSourceOptions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    uniqueIndex('agent_template_knowledge_sources_unique_idx').on(
      t.templateId,
      t.knowledgeSourceOptionId,
    ),
    index('agent_template_knowledge_sources_template_idx').on(t.templateId),
  ],
);

export const agentKnowledgeSourceSelections = pgTable(
  'agent_knowledge_source_selections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    orgId: text('org_id').notNull(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    knowledgeSourceOptionId: uuid('knowledge_source_option_id')
      .notNull()
      .references(() => knowledgeSourceOptions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    uniqueIndex('agent_knowledge_source_selections_unique_idx').on(
      t.orgId,
      t.agentId,
      t.knowledgeSourceOptionId,
    ),
    index('agent_knowledge_source_selections_agent_idx').on(t.agentId),
  ],
);
