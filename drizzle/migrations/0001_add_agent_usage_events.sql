CREATE TABLE "agent_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"message_count" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_usage_events" ADD CONSTRAINT "agent_usage_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_usage_events_org_created_idx" ON "agent_usage_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_usage_events_org_agent_idx" ON "agent_usage_events" USING btree ("org_id","agent_id");