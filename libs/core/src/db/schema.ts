/**
 * Drizzle schema — single source of truth for all database tables.
 * Add tables here as features are built in spec-03+.
 */

import { pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const agents = pgTable(
  'agents',
  {
    id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId:       text('org_id').notNull(),       // Clerk org_id from JWT — white-label operator
    workspaceId: text('workspace_id'),            // nullable — future white-label client scope
    name:        text('name').notNull(),
    status:      text('status').notNull().default('draft'), // 'draft' | 'live' | 'paused'
    templateId:  text('template_id'),
    uiConfig:    jsonb('ui_config'),              // frontend-owned: identity, behaviour, channels
    aiConfig:    jsonb('ai_config'),              // forge-core-ai-owned: model tier, RAG, tools
    shareToken:  text('share_token'),             // nullable, unique — spec-08 public chat link
    createdAt:   timestamp('created_at').notNull().default(sql`now()`),
    updatedAt:   timestamp('updated_at').notNull().default(sql`now()`),
    deletedAt:   timestamp('deleted_at'),         // nullable — soft delete
  },
  (t) => [
    index('agents_org_id_idx').on(t.orgId),
    index('agents_org_workspace_status_idx').on(t.orgId, t.workspaceId, t.status),
    uniqueIndex('agents_share_token_idx').on(t.shareToken),
  ],
);

export const agentUsageEvents = pgTable(
  'agent_usage_events',
  {
    id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orgId:        text('org_id').notNull(),
    agentId:      uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    source:       text('source').notNull(),      // 'public' | 'builder_test'
    eventType:    text('event_type').notNull(),  // 'chat_message'
    messageCount: integer('message_count').notNull().default(1),
    inputTokens:  integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    createdAt:    timestamp('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    index('agent_usage_events_org_created_idx').on(t.orgId, t.createdAt),
    index('agent_usage_events_org_agent_idx').on(t.orgId, t.agentId),
  ],
);
