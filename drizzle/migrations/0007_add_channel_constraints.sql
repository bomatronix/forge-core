-- C1: Unique partial index — prevents duplicate open conversations per user/channel/agent
-- Required by findOrCreate INSERT ON CONFLICT DO NOTHING pattern
CREATE UNIQUE INDEX conversations_channel_user_open_unique_idx
  ON conversations (workspace_channel_id, external_user_ref, agent_id)
  WHERE status = 'open' AND deleted_at IS NULL;
--> statement-breakpoint

-- C3: Change agent_id in channel_routing_rules from text → uuid with FK to agents
-- Safe: table is empty on fresh migrations (no pre-existing routing rule data)
ALTER TABLE channel_routing_rules
  ALTER COLUMN agent_id TYPE uuid USING agent_id::uuid;
--> statement-breakpoint
ALTER TABLE channel_routing_rules
  ADD CONSTRAINT channel_routing_rules_agent_id_agents_id_fk
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT;
--> statement-breakpoint

-- I1: Add FK from conversations.workspace_channel_id → workspace_channels.id (SET NULL on delete)
-- Preserves conversation history when a channel is removed
ALTER TABLE conversations
  ADD CONSTRAINT conversations_workspace_channel_id_workspace_channels_id_fk
  FOREIGN KEY (workspace_channel_id) REFERENCES workspace_channels(id) ON DELETE SET NULL;
