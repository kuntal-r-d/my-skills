CREATE TABLE "data_freshness" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"ticker_id" integer,
	"last_success_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"stale_after_hours" integer DEFAULT 24 NOT NULL,
	CONSTRAINT "freshness_entity_ticker" UNIQUE("entity_type","ticker_id")
);
--> statement-breakpoint
CREATE TABLE "fundamentals_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker_id" integer NOT NULL,
	"as_of" date NOT NULL,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamentals_ticker_asof_source" UNIQUE("ticker_id","as_of","source")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"ticker_id" integer,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "macro_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"as_of" date NOT NULL,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker_id" integer,
	"published_date" date NOT NULL,
	"headline" text NOT NULL,
	"source" text,
	"category" text,
	"url" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ohlcv_daily" (
	"ticker_id" integer NOT NULL,
	"trade_date" date NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'dse' NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text DEFAULT 'default' NOT NULL,
	"capital_bdt" double precision DEFAULT 1000000 NOT NULL,
	"risk_per_trade_pct" double precision DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"ticker_id" integer NOT NULL,
	"qty" double precision NOT NULL,
	"avg_cost" double precision NOT NULL,
	"sector" text,
	"stop_level" double precision,
	"target_level" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portfolio_account_ticker" UNIQUE("account_id","ticker_id")
);
--> statement-breakpoint
CREATE TABLE "shareholding_monthly" (
	"ticker_id" integer NOT NULL,
	"month" date NOT NULL,
	"sponsor" double precision,
	"govt" double precision,
	"institution" double precision,
	"foreign" double precision,
	"public" double precision,
	"source" text DEFAULT 'dse' NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickers" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text,
	"sector" text,
	"exchange" text DEFAULT 'DSE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickers_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "watchlist_tickers" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker_id" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_tickers_ticker_id_unique" UNIQUE("ticker_id")
);
--> statement-breakpoint
ALTER TABLE "data_freshness" ADD CONSTRAINT "data_freshness_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fundamentals_snapshots" ADD CONSTRAINT "fundamentals_snapshots_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_items" ADD CONSTRAINT "news_items_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ohlcv_daily" ADD CONSTRAINT "ohlcv_daily_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_account_id_portfolio_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."portfolio_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholding_monthly" ADD CONSTRAINT "shareholding_monthly_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_tickers" ADD CONSTRAINT "watchlist_tickers_ticker_id_tickers_id_fk" FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_ticker_date_idx" ON "news_items" USING btree ("ticker_id","published_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ohlcv_daily_ticker_date_idx" ON "ohlcv_daily" USING btree ("ticker_id","trade_date");--> statement-breakpoint
CREATE INDEX "ohlcv_daily_ticker_date_desc_idx" ON "ohlcv_daily" USING btree ("ticker_id","trade_date");--> statement-breakpoint
CREATE UNIQUE INDEX "shareholding_ticker_month_idx" ON "shareholding_monthly" USING btree ("ticker_id","month");