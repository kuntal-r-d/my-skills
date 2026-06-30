ALTER TABLE "portfolio_positions" ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'investment';

ALTER TABLE "portfolio_positions" DROP CONSTRAINT IF EXISTS "portfolio_account_ticker";

CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_account_ticker_purpose_idx" ON "portfolio_positions" ("account_id", "ticker_id", "purpose");
