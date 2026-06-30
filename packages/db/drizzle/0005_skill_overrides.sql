CREATE TABLE IF NOT EXISTS "skill_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"tool_name" text,
	"name" text,
	"description" text,
	"skill_md" text NOT NULL,
	"metadata_json" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_overrides_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_overrides_slug_idx" ON "skill_overrides" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_overrides_updated_idx" ON "skill_overrides" USING btree ("updated_at");
