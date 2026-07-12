CREATE TABLE IF NOT EXISTS "sectors" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "dse_group" text,
  "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sectors_slug_idx" ON "sectors" USING btree ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sector_snapshots" (
  "id" serial PRIMARY KEY NOT NULL,
  "sector_slug" text NOT NULL,
  "as_of" date NOT NULL,
  "metrics_json" jsonb NOT NULL,
  "news_summary_json" jsonb,
  "source" text NOT NULL,
  "ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sector_snapshots_sector_asof_idx" ON "sector_snapshots" USING btree ("sector_slug","as_of");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sector_snapshots_asof_idx" ON "sector_snapshots" USING btree ("as_of");
--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN IF NOT EXISTS "sector_tag" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_sector_tag_idx" ON "news_items" USING btree ("sector_tag");
