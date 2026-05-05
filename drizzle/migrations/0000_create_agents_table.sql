CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"template_id" text,
	"ui_config" jsonb,
	"ai_config" jsonb,
	"share_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "agents_org_id_idx" ON "agents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agents_org_workspace_status_idx" ON "agents" USING btree ("org_id","workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_share_token_idx" ON "agents" USING btree ("share_token");