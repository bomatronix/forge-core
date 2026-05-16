CREATE TABLE "channel_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_channel_id" uuid NOT NULL,
	"org_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"condition_type" text NOT NULL,
	"condition_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agent_id" text NOT NULL,
	"agent_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"workspace_channel_id" uuid,
	"external_user_ref" text,
	"external_thread_ref" text,
	"title" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workspace_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"channel_type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhook_secret" text,
	"status" text DEFAULT 'active' NOT NULL,
	"workspace_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_routing_rules" ADD CONSTRAINT "channel_routing_rules_workspace_channel_id_workspace_channels_id_fk" FOREIGN KEY ("workspace_channel_id") REFERENCES "public"."workspace_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_routing_rules_channel_priority_idx" ON "channel_routing_rules" USING btree ("workspace_channel_id","priority");--> statement-breakpoint
CREATE INDEX "conv_messages_conv_id_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversations_org_agent_idx" ON "conversations" USING btree ("org_id","agent_id");--> statement-breakpoint
CREATE INDEX "conversations_channel_user_idx" ON "conversations" USING btree ("workspace_channel_id","external_user_ref");--> statement-breakpoint
CREATE INDEX "workspace_channels_org_idx" ON "workspace_channels" USING btree ("org_id");