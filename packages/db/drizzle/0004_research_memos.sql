CREATE TABLE "research_memos" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker_id" integer,
	"session_id" text,
	"client_id" text,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"summary_json" jsonb,
	"as_of" date,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_memo_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "research_memos" ADD CONSTRAINT "research_memos_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_memos_ticker_created_idx" ON "research_memos" USING btree ("ticker_id","created_at");--> statement-breakpoint
CREATE INDEX "research_memos_session_idx" ON "research_memos" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "research_sources" ADD COLUMN "memo_id" integer;--> statement-breakpoint
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_memo_id_research_memos_id_fk" FOREIGN KEY ("memo_id") REFERENCES "public"."research_memos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_sources_memo_idx" ON "research_sources" USING btree ("memo_id");
