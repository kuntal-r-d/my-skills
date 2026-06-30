CREATE TABLE "research_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker_id" integer,
	"url" text,
	"title" text NOT NULL,
	"publisher" text,
	"published_date" date,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"query_context" text,
	"category" text,
	"extracted_facts" jsonb,
	"session_id" text,
	"client_id" text,
	"notes" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_sources_ticker_fetched_idx" ON "research_sources" USING btree ("ticker_id","fetched_at");--> statement-breakpoint
CREATE INDEX "research_sources_session_idx" ON "research_sources" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "research_sources_category_idx" ON "research_sources" USING btree ("category");
