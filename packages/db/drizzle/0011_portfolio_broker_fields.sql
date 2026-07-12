ALTER TABLE "portfolio_accounts" ADD COLUMN IF NOT EXISTS "loan_balance_bdt" double precision;
ALTER TABLE "portfolio_accounts" ADD COLUMN IF NOT EXISTS "purchasing_power_bdt" double precision;
