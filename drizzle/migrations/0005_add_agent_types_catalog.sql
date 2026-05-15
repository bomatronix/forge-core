CREATE TABLE "agent_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"org_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_option_agent_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_source_option_id" uuid NOT NULL,
	"agent_type_slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_agent_type_knowledge_catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"agent_type_slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_agent_type_knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"knowledge_source_option_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_templates" ADD COLUMN "agent_type_slug" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agent_type_slug" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_source_option_agent_types" ADD CONSTRAINT "knowledge_source_option_agent_types_knowledge_source_option_id_knowledge_source_options_id_fk" FOREIGN KEY ("knowledge_source_option_id") REFERENCES "public"."knowledge_source_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_agent_type_knowledge_sources" ADD CONSTRAINT "org_agent_type_knowledge_sources_catalog_id_org_agent_type_knowledge_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."org_agent_type_knowledge_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_agent_type_knowledge_sources" ADD CONSTRAINT "org_agent_type_knowledge_sources_knowledge_source_option_id_knowledge_source_options_id_fk" FOREIGN KEY ("knowledge_source_option_id") REFERENCES "public"."knowledge_source_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_types_scope_slug_idx" ON "agent_types" USING btree ("scope","slug");--> statement-breakpoint
CREATE INDEX "agent_types_org_idx" ON "agent_types" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agent_types_enabled_position_idx" ON "agent_types" USING btree ("enabled","position");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_option_agent_types_unique_idx" ON "knowledge_source_option_agent_types" USING btree ("knowledge_source_option_id","agent_type_slug");--> statement-breakpoint
CREATE INDEX "knowledge_source_option_agent_types_type_idx" ON "knowledge_source_option_agent_types" USING btree ("agent_type_slug","position");--> statement-breakpoint
CREATE INDEX "knowledge_source_option_agent_types_source_idx" ON "knowledge_source_option_agent_types" USING btree ("knowledge_source_option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_agent_type_knowledge_catalogs_unique_idx" ON "org_agent_type_knowledge_catalogs" USING btree ("org_id","agent_type_slug");--> statement-breakpoint
CREATE INDEX "org_agent_type_knowledge_catalogs_org_idx" ON "org_agent_type_knowledge_catalogs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_agent_type_knowledge_sources_unique_idx" ON "org_agent_type_knowledge_sources" USING btree ("catalog_id","knowledge_source_option_id");--> statement-breakpoint
CREATE INDEX "org_agent_type_knowledge_sources_catalog_idx" ON "org_agent_type_knowledge_sources" USING btree ("catalog_id","position");--> statement-breakpoint
CREATE INDEX "agent_templates_agent_type_idx" ON "agent_templates" USING btree ("agent_type_slug");--> statement-breakpoint
CREATE INDEX "agents_org_agent_type_idx" ON "agents" USING btree ("org_id","agent_type_slug");
--> statement-breakpoint

-- Seed global agent type metadata and derive knowledge-source availability from the catalog.
WITH agent_type_seed AS (
  SELECT * FROM jsonb_to_recordset($agent_types$
[
  {
    "slug": "support",
    "name": "Customer Service",
    "emoji": "💬",
    "description": "Support, helpdesk, FAQ, escalation, and customer operations",
    "position": 0
  },
  {
    "slug": "sales",
    "name": "Sales",
    "emoji": "🎯",
    "description": "Lead qualification, billing, marketing, and revenue workflows",
    "position": 1
  },
  {
    "slug": "ecommerce",
    "name": "Ecommerce",
    "emoji": "🛒",
    "description": "Orders, products, shipping, recommendations, and commerce workflows",
    "position": 2
  },
  {
    "slug": "onboarding",
    "name": "Onboarding",
    "emoji": "🚀",
    "description": "Guides, surveys, HR, event setup, and onboarding workflows",
    "position": 3
  },
  {
    "slug": "custom",
    "name": "Custom",
    "emoji": "✨",
    "description": "Scratch-built and custom-purpose agents",
    "position": 4
  }
]
$agent_types$::jsonb) AS t(slug text, name text, emoji text, description text, position integer)
)
INSERT INTO "agent_types" (
  "scope",
  "slug",
  "name",
  "emoji",
  "description",
  "enabled",
  "position"
)
SELECT
  'global',
  slug,
  name,
  emoji,
  description,
  true,
  position
FROM agent_type_seed
ON CONFLICT ("scope", "slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "emoji" = EXCLUDED."emoji",
  "description" = EXCLUDED."description",
  "enabled" = EXCLUDED."enabled",
  "position" = EXCLUDED."position",
  "updated_at" = now();
--> statement-breakpoint
UPDATE "agent_templates"
SET "agent_type_slug" = CASE
  WHEN "category" = 'blank' THEN 'custom'
  ELSE "category"
END;
--> statement-breakpoint
UPDATE "agents" a
SET "agent_type_slug" = COALESCE(t."agent_type_slug", 'custom')
FROM "agent_templates" t
WHERE a."template_id" = t."slug";
--> statement-breakpoint
WITH template_type_sources AS (
  SELECT
    s."id" AS source_id,
    CASE WHEN t."category" = 'blank' THEN 'custom' ELSE t."category" END AS agent_type_slug,
    MIN(s."position") AS position
  FROM "agent_template_knowledge_sources" tk
  JOIN "agent_templates" t ON t."id" = tk."template_id"
  JOIN "knowledge_source_options" s ON s."id" = tk."knowledge_source_option_id"
  WHERE t."enabled" = true AND s."enabled" = true
  GROUP BY s."id", CASE WHEN t."category" = 'blank' THEN 'custom' ELSE t."category" END
),
category_type_sources AS (
  SELECT
    s."id" AS source_id,
    s."category" AS agent_type_slug,
    s."position" AS position
  FROM "knowledge_source_options" s
  JOIN "agent_types" agent_type
    ON agent_type."scope" = 'global' AND agent_type."slug" = s."category"
  WHERE s."enabled" = true AND agent_type."enabled" = true
),
custom_type_sources AS (
  SELECT
    s."id" AS source_id,
    'custom' AS agent_type_slug,
    s."position" AS position
  FROM "knowledge_source_options" s
  WHERE s."enabled" = true
),
merged_type_sources AS (
  SELECT source_id, agent_type_slug, MIN(position) AS position
  FROM (
    SELECT * FROM template_type_sources
    UNION ALL
    SELECT * FROM category_type_sources
    UNION ALL
    SELECT * FROM custom_type_sources
  ) typed_sources
  GROUP BY source_id, agent_type_slug
)
INSERT INTO "knowledge_source_option_agent_types" (
  "knowledge_source_option_id",
  "agent_type_slug",
  "position"
)
SELECT
  source_id,
  agent_type_slug,
  position
FROM merged_type_sources
ON CONFLICT ("knowledge_source_option_id", "agent_type_slug") DO UPDATE SET
  "position" = EXCLUDED."position";
