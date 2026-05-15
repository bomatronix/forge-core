CREATE TABLE "agent_knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"question" text,
	"answer" text,
	"content" text,
	"source_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_knowledge_items_agent_id_idx" ON "agent_knowledge_items" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_items_org_agent_idx" ON "agent_knowledge_items" USING btree ("org_id","agent_id");