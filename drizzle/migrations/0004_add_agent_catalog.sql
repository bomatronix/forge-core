CREATE TABLE "agent_knowledge_source_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"knowledge_source_option_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_template_knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"knowledge_source_option_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"org_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"identity" jsonb NOT NULL,
	"behaviour" jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_source_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"org_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"ui_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD COLUMN "knowledge_source_option_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_knowledge_source_selections" ADD CONSTRAINT "agent_knowledge_source_selections_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_source_selections" ADD CONSTRAINT "agent_knowledge_source_selections_knowledge_source_option_id_knowledge_source_options_id_fk" FOREIGN KEY ("knowledge_source_option_id") REFERENCES "public"."knowledge_source_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_template_knowledge_sources" ADD CONSTRAINT "agent_template_knowledge_sources_template_id_agent_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."agent_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_template_knowledge_sources" ADD CONSTRAINT "agent_template_knowledge_sources_knowledge_source_option_id_knowledge_source_options_id_fk" FOREIGN KEY ("knowledge_source_option_id") REFERENCES "public"."knowledge_source_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_knowledge_source_selections_unique_idx" ON "agent_knowledge_source_selections" USING btree ("org_id","agent_id","knowledge_source_option_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_source_selections_agent_idx" ON "agent_knowledge_source_selections" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_template_knowledge_sources_unique_idx" ON "agent_template_knowledge_sources" USING btree ("template_id","knowledge_source_option_id");--> statement-breakpoint
CREATE INDEX "agent_template_knowledge_sources_template_idx" ON "agent_template_knowledge_sources" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_templates_scope_slug_idx" ON "agent_templates" USING btree ("scope","slug");--> statement-breakpoint
CREATE INDEX "agent_templates_org_idx" ON "agent_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "agent_templates_category_idx" ON "agent_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "agent_templates_enabled_position_idx" ON "agent_templates" USING btree ("enabled","position");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_source_options_scope_slug_idx" ON "knowledge_source_options" USING btree ("scope","slug");--> statement-breakpoint
CREATE INDEX "knowledge_source_options_org_idx" ON "knowledge_source_options" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_options_enabled_position_idx" ON "knowledge_source_options" USING btree ("enabled","position");--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_knowledge_source_option_id_knowledge_source_options_id_fk" FOREIGN KEY ("knowledge_source_option_id") REFERENCES "public"."knowledge_source_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_knowledge_items_source_idx" ON "agent_knowledge_items" USING btree ("knowledge_source_option_id");--> statement-breakpoint

-- Seed global knowledge source options and template catalog.
WITH source_seed AS (
  SELECT * FROM jsonb_to_recordset($sources$
[
  {
    "slug": "product-docs",
    "name": "Product Docs",
    "emoji": "📘",
    "description": "Technical documentation and guides",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 0
  },
  {
    "slug": "faq-database",
    "name": "FAQ Database",
    "emoji": "❓",
    "description": "Frequently asked questions and answers",
    "category": "support",
    "ui_schema": {
      "setupMode": "qa"
    },
    "position": 1
  },
  {
    "slug": "pricing-and-plans",
    "name": "Pricing & Plans",
    "emoji": "💳",
    "description": "Current pricing tiers and features",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 2
  },
  {
    "slug": "product-overview",
    "name": "Product Overview",
    "emoji": "🗂️",
    "description": "High-level product descriptions",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 3
  },
  {
    "slug": "case-studies",
    "name": "Case Studies",
    "emoji": "📊",
    "description": "Customer success stories",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 4
  },
  {
    "slug": "order-policies",
    "name": "Order Policies",
    "emoji": "📋",
    "description": "Order terms and conditions",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 5
  },
  {
    "slug": "return-policy",
    "name": "Return Policy",
    "emoji": "🔄",
    "description": "Returns and exchanges policy",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 6
  },
  {
    "slug": "shipping-info",
    "name": "Shipping Info",
    "emoji": "🚚",
    "description": "Delivery times and carriers",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 7
  },
  {
    "slug": "getting-started-guide",
    "name": "Getting Started Guide",
    "emoji": "🚀",
    "description": "Onboarding and setup instructions",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 8
  },
  {
    "slug": "feature-docs",
    "name": "Feature Docs",
    "emoji": "✨",
    "description": "Detailed feature documentation",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 9
  },
  {
    "slug": "video-tutorials",
    "name": "Video Tutorials",
    "emoji": "🎬",
    "description": "Step-by-step video walkthroughs",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 10
  },
  {
    "slug": "it-policies",
    "name": "IT Policies",
    "emoji": "🔒",
    "description": "IT security and usage policies",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 11
  },
  {
    "slug": "common-issues",
    "name": "Common Issues",
    "emoji": "🔧",
    "description": "Known issues and troubleshooting steps",
    "category": "support",
    "ui_schema": {
      "setupMode": "qa"
    },
    "position": 12
  },
  {
    "slug": "software-guides",
    "name": "Software Guides",
    "emoji": "💻",
    "description": "Software setup and configuration guides",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 13
  },
  {
    "slug": "pricing",
    "name": "Pricing",
    "emoji": "💳",
    "description": "Pricing tiers, packages, and plan details",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 14
  },
  {
    "slug": "availability-calendar",
    "name": "Availability Calendar",
    "emoji": "📅",
    "description": "Availability calendar and scheduling reference",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 15
  },
  {
    "slug": "booking-policies",
    "name": "Booking Policies",
    "emoji": "📋",
    "description": "Business policies and operating rules",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 16
  },
  {
    "slug": "location-info",
    "name": "Location Info",
    "emoji": "📍",
    "description": "Location details, hours, and directions",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 17
  },
  {
    "slug": "product-catalog",
    "name": "Product Catalog",
    "emoji": "🛍️",
    "description": "Product catalog information and inventory details",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "integration",
      "integrationProvider": "shopify"
    },
    "position": 18
  },
  {
    "slug": "customer-reviews",
    "name": "Customer Reviews",
    "emoji": "📊",
    "description": "Customer review summaries and product feedback",
    "category": "support",
    "ui_schema": {
      "setupMode": "qa"
    },
    "position": 19
  },
  {
    "slug": "promotions",
    "name": "Promotions",
    "emoji": "🏷️",
    "description": "Current promotions, discounts, and campaign details",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 20
  },
  {
    "slug": "company-policies",
    "name": "Company Policies",
    "emoji": "📋",
    "description": "Business policies and operating rules",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 21
  },
  {
    "slug": "survey-templates",
    "name": "Survey Templates",
    "emoji": "📝",
    "description": "Survey templates and response handling guidance",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 22
  },
  {
    "slug": "response-guidelines",
    "name": "Response Guidelines",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 23
  },
  {
    "slug": "privacy-policy",
    "name": "Privacy Policy",
    "emoji": "📋",
    "description": "Business policies and operating rules",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 24
  },
  {
    "slug": "billing-policies",
    "name": "Billing Policies",
    "emoji": "💳",
    "description": "Billing policies, invoices, and subscription procedures",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 25
  },
  {
    "slug": "pricing-plans",
    "name": "Pricing Plans",
    "emoji": "💳",
    "description": "Pricing tiers, packages, and plan details",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 26
  },
  {
    "slug": "payment-methods",
    "name": "Payment Methods",
    "emoji": "💳",
    "description": "Accepted payment methods and payment instructions",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 27
  },
  {
    "slug": "brand-guidelines",
    "name": "Brand Guidelines",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 28
  },
  {
    "slug": "content-calendar",
    "name": "Content Calendar",
    "emoji": "📅",
    "description": "Availability calendar and scheduling reference",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 29
  },
  {
    "slug": "platform-best-practices",
    "name": "Platform Best Practices",
    "emoji": "📘",
    "description": "Reference material for platform best practices",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 30
  },
  {
    "slug": "employee-handbook",
    "name": "Employee Handbook",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 31
  },
  {
    "slug": "benefits-guide",
    "name": "Benefits Guide",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 32
  },
  {
    "slug": "destination-guides",
    "name": "Destination Guides",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 33
  },
  {
    "slug": "travel-policies",
    "name": "Travel Policies",
    "emoji": "📋",
    "description": "Business policies and operating rules",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 34
  },
  {
    "slug": "loyalty-programs",
    "name": "Loyalty Programs",
    "emoji": "✈️",
    "description": "Loyalty program rules and member benefits",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 35
  },
  {
    "slug": "style-guide",
    "name": "Style Guide",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 36
  },
  {
    "slug": "security-checklist",
    "name": "Security Checklist",
    "emoji": "📋",
    "description": "Security requirements, checklists, and best practices",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 37
  },
  {
    "slug": "best-practices",
    "name": "Best Practices",
    "emoji": "📘",
    "description": "Reference material for best practices",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 38
  },
  {
    "slug": "venue-directory",
    "name": "Venue Directory",
    "emoji": "🎉",
    "description": "Event planning resources, venues, and catering options",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 39
  },
  {
    "slug": "catering-options",
    "name": "Catering Options",
    "emoji": "🎉",
    "description": "Event planning resources, venues, and catering options",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 40
  },
  {
    "slug": "event-templates",
    "name": "Event Templates",
    "emoji": "🎉",
    "description": "Event planning resources, venues, and catering options",
    "category": "onboarding",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 41
  },
  {
    "slug": "supplier-directory",
    "name": "Supplier Directory",
    "emoji": "📦",
    "description": "Supplier, warehouse, and inventory operating details",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 42
  },
  {
    "slug": "warehouse-policies",
    "name": "Warehouse Policies",
    "emoji": "📋",
    "description": "Business policies and operating rules",
    "category": "ecommerce",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 43
  },
  {
    "slug": "regulatory-database",
    "name": "Regulatory Database",
    "emoji": "📋",
    "description": "Compliance requirements and regulatory reference material",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 44
  },
  {
    "slug": "compliance-policies",
    "name": "Compliance Policies",
    "emoji": "📋",
    "description": "Business policies and operating rules",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 45
  },
  {
    "slug": "audit-templates",
    "name": "Audit Templates",
    "emoji": "📊",
    "description": "Audit templates and reporting requirements",
    "category": "support",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 46
  },
  {
    "slug": "brand-voice-guide",
    "name": "Brand Voice Guide",
    "emoji": "📘",
    "description": "Documentation, guides, and reference material",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 47
  },
  {
    "slug": "email-templates",
    "name": "Email Templates",
    "emoji": "✉️",
    "description": "Email templates, campaign guidance, and messaging context",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 48
  },
  {
    "slug": "campaign-analytics",
    "name": "Campaign Analytics",
    "emoji": "📊",
    "description": "Analytics definitions and performance reporting context",
    "category": "sales",
    "ui_schema": {
      "setupMode": "document"
    },
    "position": 49
  }
]
$sources$::jsonb) AS s(
    slug text,
    name text,
    emoji text,
    description text,
    category text,
    ui_schema jsonb,
    position integer
  )
)
INSERT INTO "knowledge_source_options" ("scope", "org_id", "slug", "name", "emoji", "description", "category", "ui_schema", "position")
SELECT 'global', NULL, slug, name, emoji, description, category, ui_schema, position
FROM source_seed
ON CONFLICT ("scope", "slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "emoji" = EXCLUDED."emoji",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "ui_schema" = EXCLUDED."ui_schema",
  "position" = EXCLUDED."position",
  "enabled" = true,
  "updated_at" = now();--> statement-breakpoint

WITH template_seed AS (
  SELECT * FROM jsonb_to_recordset($templates$
[
  {
    "slug": "blank",
    "name": "Start from Scratch",
    "emoji": "✨",
    "category": "blank",
    "description": "Build a custom agent from scratch",
    "identity": {
      "name": "My Assistant",
      "welcomeMessage": "Hi! How can I help you today?",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "",
      "responseStyle": 50,
      "fallback": "handoff",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [],
    "channels": [],
    "position": 0
  },
  {
    "slug": "customer-support",
    "name": "Customer Support",
    "emoji": "💬",
    "category": "support",
    "description": "FAQ, order tracking, and escalation",
    "identity": {
      "name": "Support Assistant",
      "welcomeMessage": "Hi! How can I help?",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a helpful customer support assistant. Your goal is to assist customers with their questions, resolve issues efficiently, and escalate to human agents when necessary.",
      "responseStyle": 30,
      "fallback": "handoff",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": [
        {
          "id": "tpl-cs-1",
          "name": "Refund Handling",
          "category": "escalation",
          "whenCondition": "Customer requests a refund for an order over $100",
          "instructions": "Escalate to a supervisor before processing. Confirm order details and reason for refund.",
          "enabled": true,
          "createdAt": "2025-01-01T00:00:00.000Z",
          "updatedAt": "2025-01-01T00:00:00.000Z"
        },
        {
          "id": "tpl-cs-2",
          "name": "Greeting Protocol",
          "category": "communication",
          "whenCondition": "A new conversation starts or the customer greets",
          "instructions": "Greet warmly by name if available. Introduce yourself and ask how you can help today.",
          "enabled": true,
          "createdAt": "2025-01-01T00:00:00.000Z",
          "updatedAt": "2025-01-01T00:00:00.000Z"
        }
      ]
    },
    "actions": [
      "Process Refund",
      "Book Meeting",
      "Create Ticket"
    ],
    "channels": [
      "web"
    ],
    "position": 1
  },
  {
    "slug": "lead-qualifier",
    "name": "Lead Qualifier",
    "emoji": "🎯",
    "category": "sales",
    "description": "Qualify leads and book demo calls",
    "identity": {
      "name": "Sales Assistant",
      "welcomeMessage": "Hi! Looking for a solution?",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a sales assistant that qualifies leads by understanding their needs, budget, and timeline. Your goal is to identify high-quality prospects and book demo calls.",
      "responseStyle": 60,
      "fallback": "handoff",
      "tonePreset": "formal",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": [
        {
          "id": "tpl-lq-1",
          "name": "Budget Qualification",
          "category": "communication",
          "whenCondition": "Lead mentions budget or pricing questions",
          "instructions": "Gauge budget range before sharing pricing details. Qualify if within target range before booking a demo.",
          "enabled": true,
          "createdAt": "2025-01-01T00:00:00.000Z",
          "updatedAt": "2025-01-01T00:00:00.000Z"
        }
      ]
    },
    "actions": [
      "Book Demo",
      "Send Brochure",
      "Create Lead"
    ],
    "channels": [
      "web"
    ],
    "position": 2
  },
  {
    "slug": "order-assistant",
    "name": "Order Assistant",
    "emoji": "📦",
    "category": "ecommerce",
    "description": "Track orders and handle returns",
    "identity": {
      "name": "Order Bot",
      "welcomeMessage": "Hi! I can help with your order.",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an order management assistant. Help customers track their orders, process returns, and resolve delivery issues quickly and efficiently.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Track Order",
      "Process Return",
      "Update Address"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 3
  },
  {
    "slug": "user-onboarding",
    "name": "User Onboarding",
    "emoji": "🚀",
    "category": "onboarding",
    "description": "Guide new users through setup",
    "identity": {
      "name": "Onboarding Guide",
      "welcomeMessage": "Welcome! Let me help you get started.",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an onboarding assistant. Guide new users through the product setup, answer their initial questions, and help them achieve their first success milestone.",
      "responseStyle": 70,
      "fallback": "email",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Schedule Call",
      "Send Tutorial",
      "Create Account"
    ],
    "channels": [
      "web"
    ],
    "position": 4
  },
  {
    "slug": "it-helpdesk",
    "name": "IT Helpdesk",
    "emoji": "🔧",
    "category": "support",
    "description": "Handle IT requests and troubleshooting",
    "identity": {
      "name": "IT Support Bot",
      "welcomeMessage": "Hi! What IT issue can I help with?",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an IT helpdesk assistant. Help employees with technical issues, password resets, software installations, and other IT requests.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Create IT Ticket",
      "Reset Password",
      "Escalate Issue"
    ],
    "channels": [
      "web",
      "slack"
    ],
    "position": 5
  },
  {
    "slug": "appointment-scheduler",
    "name": "Appointment Scheduler",
    "emoji": "📅",
    "category": "support",
    "description": "Schedule, reschedule, and cancel appointments",
    "identity": {
      "name": "Scheduler Bot",
      "welcomeMessage": "Hi! Need to book or change an appointment?",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an appointment scheduling assistant. Help users find available time slots, book new appointments, reschedule existing ones, and send reminders.",
      "responseStyle": 30,
      "fallback": "handoff",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Book Appointment",
      "Reschedule",
      "Cancel Appointment"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 6
  },
  {
    "slug": "product-recommender",
    "name": "Product Recommender",
    "emoji": "🛍️",
    "category": "ecommerce",
    "description": "Suggest products based on preferences",
    "identity": {
      "name": "Shopping Assistant",
      "welcomeMessage": "Hi! Looking for something specific?",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a product recommendation assistant. Understand customer preferences, budget, and needs to suggest the most relevant products from the catalog.",
      "responseStyle": 60,
      "fallback": "handoff",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Add to Cart",
      "Compare Products",
      "Check Availability"
    ],
    "channels": [
      "web"
    ],
    "position": 7
  },
  {
    "slug": "faq-bot",
    "name": "FAQ Bot",
    "emoji": "❓",
    "category": "support",
    "description": "Answer common questions instantly",
    "identity": {
      "name": "FAQ Assistant",
      "welcomeMessage": "Hi! Ask me anything.",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a FAQ assistant. Provide clear, concise answers to frequently asked questions. If you cannot find an answer, offer to connect the user with a human agent.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Search FAQ",
      "Create Ticket",
      "Rate Answer"
    ],
    "channels": [
      "web",
      "slack"
    ],
    "position": 8
  },
  {
    "slug": "survey-collector",
    "name": "Survey Collector",
    "emoji": "📋",
    "category": "onboarding",
    "description": "Gather feedback through conversational surveys",
    "identity": {
      "name": "Survey Bot",
      "welcomeMessage": "Hi! We'd love your feedback.",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a survey collection assistant. Guide users through survey questions in a conversational manner, collect their responses, and thank them for their feedback.",
      "responseStyle": 50,
      "fallback": "email",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Start Survey",
      "Skip Question",
      "Submit Response"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 9
  },
  {
    "slug": "billing-assistant",
    "name": "Billing Assistant",
    "emoji": "💳",
    "category": "sales",
    "description": "Handle invoices, payments, and billing queries",
    "identity": {
      "name": "Billing Bot",
      "welcomeMessage": "Hi! How can I help with billing?",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a billing assistant. Help customers with invoice questions, payment processing, subscription changes, and billing disputes.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "View Invoice",
      "Update Payment",
      "Apply Discount"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 10
  },
  {
    "slug": "social-media-manager",
    "name": "Social Media Manager",
    "emoji": "📱",
    "category": "sales",
    "description": "Draft posts, reply to comments, and track engagement",
    "identity": {
      "name": "Social Bot",
      "welcomeMessage": "Hi! Ready to boost your social presence?",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a social media management assistant. Help users draft posts, schedule content, respond to comments, and analyze engagement metrics across platforms.",
      "responseStyle": 70,
      "fallback": "handoff",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Draft Post",
      "Schedule Content",
      "Analyze Engagement"
    ],
    "channels": [
      "web",
      "slack"
    ],
    "position": 11
  },
  {
    "slug": "hr-assistant",
    "name": "HR Assistant",
    "emoji": "👥",
    "category": "onboarding",
    "description": "Answer employee questions about policies and benefits",
    "identity": {
      "name": "HR Bot",
      "welcomeMessage": "Hi! I can help with HR questions.",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an HR assistant. Help employees with questions about company policies, benefits enrollment, time-off requests, and onboarding procedures.",
      "responseStyle": 30,
      "fallback": "handoff",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Submit Time Off",
      "Check Benefits",
      "Open HR Case"
    ],
    "channels": [
      "web",
      "slack"
    ],
    "position": 12
  },
  {
    "slug": "travel-planner",
    "name": "Travel Planner",
    "emoji": "✈️",
    "category": "ecommerce",
    "description": "Search flights, hotels, and build itineraries",
    "identity": {
      "name": "Travel Bot",
      "welcomeMessage": "Hi! Where are you headed?",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a travel planning assistant. Help users find flights, compare hotels, build itineraries, and provide destination recommendations based on their preferences and budget.",
      "responseStyle": 60,
      "fallback": "handoff",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Search Flights",
      "Compare Hotels",
      "Build Itinerary"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 13
  },
  {
    "slug": "code-reviewer",
    "name": "Code Reviewer",
    "emoji": "🔍",
    "category": "support",
    "description": "Review pull requests and suggest improvements",
    "identity": {
      "name": "Code Review Bot",
      "welcomeMessage": "Hi! Paste your code for review.",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a code review assistant. Analyze code for bugs, performance issues, security vulnerabilities, and style violations. Provide constructive feedback with suggested fixes.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Review PR",
      "Run Linter",
      "Suggest Fix"
    ],
    "channels": [
      "web",
      "slack"
    ],
    "position": 14
  },
  {
    "slug": "event-coordinator",
    "name": "Event Coordinator",
    "emoji": "🎉",
    "category": "onboarding",
    "description": "Plan events, manage RSVPs, and send reminders",
    "identity": {
      "name": "Event Bot",
      "welcomeMessage": "Hi! Let's plan your event.",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an event coordination assistant. Help users plan events, manage guest lists, send invitations, track RSVPs, and coordinate logistics.",
      "responseStyle": 50,
      "fallback": "email",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Create Event",
      "Send Invites",
      "Track RSVPs"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 15
  },
  {
    "slug": "inventory-tracker",
    "name": "Inventory Tracker",
    "emoji": "📊",
    "category": "ecommerce",
    "description": "Monitor stock levels and automate reorder alerts",
    "identity": {
      "name": "Inventory Bot",
      "welcomeMessage": "Hi! Need a stock update?",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are an inventory management assistant. Help users track stock levels, set reorder thresholds, generate inventory reports, and manage supplier communications.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Check Stock",
      "Set Reorder Alert",
      "Generate Report"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 16
  },
  {
    "slug": "compliance-checker",
    "name": "Compliance Checker",
    "emoji": "🛡️",
    "category": "support",
    "description": "Verify regulatory compliance and flag risks",
    "identity": {
      "name": "Compliance Bot",
      "welcomeMessage": "Hi! Let me check your compliance status.",
      "tone": "professional",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a compliance verification assistant. Help users understand regulatory requirements, check document compliance, flag potential violations, and generate audit-ready reports.",
      "responseStyle": 20,
      "fallback": "ticket",
      "tonePreset": "neutral",
      "customToneInstructions": "",
      "useEmojis": false,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Run Compliance Check",
      "Flag Violation",
      "Generate Audit Report"
    ],
    "channels": [
      "web"
    ],
    "position": 17
  },
  {
    "slug": "newsletter-writer",
    "name": "Newsletter Writer",
    "emoji": "✉️",
    "category": "sales",
    "description": "Draft, personalize, and schedule email campaigns",
    "identity": {
      "name": "Newsletter Bot",
      "welcomeMessage": "Hi! Ready to craft your next email?",
      "tone": "friendly",
      "language": "en-US"
    },
    "behaviour": {
      "systemPrompt": "You are a newsletter writing assistant. Help users draft compelling email content, segment audiences, personalize messaging, and schedule campaign sends.",
      "responseStyle": 70,
      "fallback": "handoff",
      "tonePreset": "friendly",
      "customToneInstructions": "",
      "useEmojis": true,
      "showSourceLinks": true,
      "guidanceRules": []
    },
    "actions": [
      "Draft Email",
      "Segment Audience",
      "Schedule Send"
    ],
    "channels": [
      "web",
      "email"
    ],
    "position": 18
  }
]
$templates$::jsonb) AS t(
    slug text,
    name text,
    emoji text,
    category text,
    description text,
    identity jsonb,
    behaviour jsonb,
    actions jsonb,
    channels jsonb,
    position integer
  )
)
INSERT INTO "agent_templates" ("scope", "org_id", "slug", "name", "emoji", "category", "description", "identity", "behaviour", "actions", "channels", "position")
SELECT 'global', NULL, slug, name, emoji, category, description, identity, behaviour, actions, channels, position
FROM template_seed
ON CONFLICT ("scope", "slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "emoji" = EXCLUDED."emoji",
  "category" = EXCLUDED."category",
  "description" = EXCLUDED."description",
  "identity" = EXCLUDED."identity",
  "behaviour" = EXCLUDED."behaviour",
  "actions" = EXCLUDED."actions",
  "channels" = EXCLUDED."channels",
  "position" = EXCLUDED."position",
  "enabled" = true,
  "updated_at" = now();--> statement-breakpoint

WITH link_seed AS (
  SELECT * FROM jsonb_to_recordset($links$
[
  {
    "template_slug": "customer-support",
    "source_slug": "product-docs",
    "position": 0
  },
  {
    "template_slug": "customer-support",
    "source_slug": "faq-database",
    "position": 1
  },
  {
    "template_slug": "customer-support",
    "source_slug": "pricing-and-plans",
    "position": 2
  },
  {
    "template_slug": "lead-qualifier",
    "source_slug": "product-overview",
    "position": 0
  },
  {
    "template_slug": "lead-qualifier",
    "source_slug": "pricing",
    "position": 1
  },
  {
    "template_slug": "lead-qualifier",
    "source_slug": "case-studies",
    "position": 2
  },
  {
    "template_slug": "order-assistant",
    "source_slug": "order-policies",
    "position": 0
  },
  {
    "template_slug": "order-assistant",
    "source_slug": "return-policy",
    "position": 1
  },
  {
    "template_slug": "order-assistant",
    "source_slug": "shipping-info",
    "position": 2
  },
  {
    "template_slug": "user-onboarding",
    "source_slug": "getting-started-guide",
    "position": 0
  },
  {
    "template_slug": "user-onboarding",
    "source_slug": "feature-docs",
    "position": 1
  },
  {
    "template_slug": "user-onboarding",
    "source_slug": "video-tutorials",
    "position": 2
  },
  {
    "template_slug": "it-helpdesk",
    "source_slug": "it-policies",
    "position": 0
  },
  {
    "template_slug": "it-helpdesk",
    "source_slug": "common-issues",
    "position": 1
  },
  {
    "template_slug": "it-helpdesk",
    "source_slug": "software-guides",
    "position": 2
  },
  {
    "template_slug": "appointment-scheduler",
    "source_slug": "availability-calendar",
    "position": 0
  },
  {
    "template_slug": "appointment-scheduler",
    "source_slug": "booking-policies",
    "position": 1
  },
  {
    "template_slug": "appointment-scheduler",
    "source_slug": "location-info",
    "position": 2
  },
  {
    "template_slug": "product-recommender",
    "source_slug": "product-catalog",
    "position": 0
  },
  {
    "template_slug": "product-recommender",
    "source_slug": "customer-reviews",
    "position": 1
  },
  {
    "template_slug": "product-recommender",
    "source_slug": "promotions",
    "position": 2
  },
  {
    "template_slug": "faq-bot",
    "source_slug": "faq-database",
    "position": 0
  },
  {
    "template_slug": "faq-bot",
    "source_slug": "product-docs",
    "position": 1
  },
  {
    "template_slug": "faq-bot",
    "source_slug": "company-policies",
    "position": 2
  },
  {
    "template_slug": "survey-collector",
    "source_slug": "survey-templates",
    "position": 0
  },
  {
    "template_slug": "survey-collector",
    "source_slug": "response-guidelines",
    "position": 1
  },
  {
    "template_slug": "survey-collector",
    "source_slug": "privacy-policy",
    "position": 2
  },
  {
    "template_slug": "billing-assistant",
    "source_slug": "billing-policies",
    "position": 0
  },
  {
    "template_slug": "billing-assistant",
    "source_slug": "pricing-plans",
    "position": 1
  },
  {
    "template_slug": "billing-assistant",
    "source_slug": "payment-methods",
    "position": 2
  },
  {
    "template_slug": "social-media-manager",
    "source_slug": "brand-guidelines",
    "position": 0
  },
  {
    "template_slug": "social-media-manager",
    "source_slug": "content-calendar",
    "position": 1
  },
  {
    "template_slug": "social-media-manager",
    "source_slug": "platform-best-practices",
    "position": 2
  },
  {
    "template_slug": "hr-assistant",
    "source_slug": "employee-handbook",
    "position": 0
  },
  {
    "template_slug": "hr-assistant",
    "source_slug": "benefits-guide",
    "position": 1
  },
  {
    "template_slug": "hr-assistant",
    "source_slug": "company-policies",
    "position": 2
  },
  {
    "template_slug": "travel-planner",
    "source_slug": "destination-guides",
    "position": 0
  },
  {
    "template_slug": "travel-planner",
    "source_slug": "travel-policies",
    "position": 1
  },
  {
    "template_slug": "travel-planner",
    "source_slug": "loyalty-programs",
    "position": 2
  },
  {
    "template_slug": "code-reviewer",
    "source_slug": "style-guide",
    "position": 0
  },
  {
    "template_slug": "code-reviewer",
    "source_slug": "security-checklist",
    "position": 1
  },
  {
    "template_slug": "code-reviewer",
    "source_slug": "best-practices",
    "position": 2
  },
  {
    "template_slug": "event-coordinator",
    "source_slug": "venue-directory",
    "position": 0
  },
  {
    "template_slug": "event-coordinator",
    "source_slug": "catering-options",
    "position": 1
  },
  {
    "template_slug": "event-coordinator",
    "source_slug": "event-templates",
    "position": 2
  },
  {
    "template_slug": "inventory-tracker",
    "source_slug": "product-catalog",
    "position": 0
  },
  {
    "template_slug": "inventory-tracker",
    "source_slug": "supplier-directory",
    "position": 1
  },
  {
    "template_slug": "inventory-tracker",
    "source_slug": "warehouse-policies",
    "position": 2
  },
  {
    "template_slug": "compliance-checker",
    "source_slug": "regulatory-database",
    "position": 0
  },
  {
    "template_slug": "compliance-checker",
    "source_slug": "compliance-policies",
    "position": 1
  },
  {
    "template_slug": "compliance-checker",
    "source_slug": "audit-templates",
    "position": 2
  },
  {
    "template_slug": "newsletter-writer",
    "source_slug": "brand-voice-guide",
    "position": 0
  },
  {
    "template_slug": "newsletter-writer",
    "source_slug": "email-templates",
    "position": 1
  },
  {
    "template_slug": "newsletter-writer",
    "source_slug": "campaign-analytics",
    "position": 2
  }
]
$links$::jsonb) AS l(template_slug text, source_slug text, position integer)
)
INSERT INTO "agent_template_knowledge_sources" ("template_id", "knowledge_source_option_id", "position")
SELECT t."id", s."id", l."position"
FROM link_seed l
JOIN "agent_templates" t ON t."scope" = 'global' AND t."slug" = l.template_slug
JOIN "knowledge_source_options" s ON s."scope" = 'global' AND s."slug" = l.source_slug
ON CONFLICT ("template_id", "knowledge_source_option_id") DO UPDATE SET
  "position" = EXCLUDED."position";--> statement-breakpoint
