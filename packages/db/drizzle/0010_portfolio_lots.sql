CREATE TABLE IF NOT EXISTS "portfolio_lots" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer NOT NULL,
  "ticker_id" integer NOT NULL,
  "purpose" text DEFAULT 'investment' NOT NULL,
  "trade_date" date NOT NULL,
  "qty" double precision NOT NULL,
  "price" double precision NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "portfolio_lots" ADD CONSTRAINT "portfolio_lots_account_id_portfolio_accounts_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "public"."portfolio_accounts"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "portfolio_lots" ADD CONSTRAINT "portfolio_lots_ticker_id_tickers_id_fk"
  FOREIGN KEY ("ticker_id") REFERENCES "public"."tickers"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "portfolio_lots_lookup_idx" ON "portfolio_lots" ("account_id", "ticker_id", "purpose");

-- One synthetic fill per existing position so history is not empty after upgrade.
INSERT INTO "portfolio_lots" ("account_id", "ticker_id", "purpose", "trade_date", "qty", "price", "notes")
SELECT
  "account_id",
  "ticker_id",
  "purpose",
  COALESCE("updated_at"::date, CURRENT_DATE),
  "qty",
  "avg_cost",
  'Imported from position total'
FROM "portfolio_positions"
WHERE NOT EXISTS (
  SELECT 1 FROM "portfolio_lots" pl
  WHERE pl.account_id = portfolio_positions.account_id
    AND pl.ticker_id = portfolio_positions.ticker_id
    AND pl.purpose = portfolio_positions.purpose
);
