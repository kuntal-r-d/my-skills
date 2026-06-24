ALTER TABLE "tickers" ADD COLUMN IF NOT EXISTS "commodity_type" text;

ALTER TABLE "watchlist_tickers" ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'investment';

ALTER TABLE "watchlist_tickers" DROP CONSTRAINT IF EXISTS "watchlist_tickers_ticker_id_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_ticker_purpose_idx" ON "watchlist_tickers" ("ticker_id", "purpose");

CREATE TABLE IF NOT EXISTS "prediction_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "ticker_id" integer NOT NULL REFERENCES "tickers"("id") ON DELETE cascade,
  "signal_date" date NOT NULL,
  "predicted_action" text NOT NULL,
  "predicted_rating" text,
  "actual_return_1w" double precision,
  "actual_return_1m" double precision,
  "actual_return_3m" double precision,
  "criterion_id" integer,
  "agent_name" text,
  "snapshot_id" integer REFERENCES "analysis_snapshots"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "prediction_outcomes_ticker_date_idx" ON "prediction_outcomes" ("ticker_id", "signal_date");
