#!/usr/bin/env node
/**
 * Import portfolio from JSON into Postgres (portfolio_accounts + portfolio_positions).
 * Usage: node scripts/import-portfolio.mjs [path/to/portfolio.json]
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = process.argv[2] ?? join(repoRoot, 'scripts/portfolio-kuntal.json');

const { loadEnv, createDb, closeDb, getDefaultAccount, ensureTicker, replacePortfolioPositionWithFill, setAccount } =
  await import('@stock-buddy/db');

loadEnv();

const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
const db = createDb();

try {
  let account = await getDefaultAccount(db);
  if (!account) {
    throw new Error('No portfolio account — run npm run db:seed first');
  }

  if (data.account) {
    await setAccount(db, account.id, {
      capitalBdt: data.account.capital_bdt,
      riskPerTradePct: data.account.risk_per_trade_pct,
      label: data.account.label,
      loanBalanceBdt: data.account.loan_balance_bdt,
      purchasingPowerBdt: data.account.purchasing_power_bdt,
    });
    console.log(`Account updated: capital_bdt=${data.account.capital_bdt}`);
  }

  for (const p of data.positions) {
    const t = await ensureTicker(db, p.ticker, { sector: p.sector });
    const purpose = p.purpose === 'trading' ? 'trading' : 'investment';
    await replacePortfolioPositionWithFill(db, account.id, t.id, {
      qty: p.qty,
      price: p.avg_cost,
      sector: p.sector ?? t.sector ?? undefined,
      stopLevel: p.stop_level,
      targetLevel: p.target_level,
      purpose,
      tradeDate: p.trade_date,
      notes: p.notes ?? 'Imported from portfolio JSON',
    });
    console.log(`  ${p.ticker} [${purpose}]: ${p.qty} @ ${p.avg_cost}`);
  }

  console.log(`\nImported ${data.positions.length} positions from ${jsonPath}`);
} finally {
  await closeDb();
}
