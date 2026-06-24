#!/usr/bin/env npx tsx
/**
 * Cross-check fundamentals across ingest sources for one or more tickers.
 * Usage: npm run verify:fundamentals -- --ticker ACI [--ticker LHB]
 */
import { mergeFundamentals } from '@stock-buddy/core';
import {
  fetchAmarStockFundamentals,
  fetchLankabdFundamentals,
  fetchStockAnalysisFundamentals,
  fetchStockAnalysisStatistics,
  fetchText,
  parseDseCompanyHtml,
} from '@stock-buddy/scraper';

const FIELDS = [
  'price',
  'eps_ttm',
  'pe',
  'market_cap',
  'dividend_yield',
  'beta',
  'book_value_per_share',
  'pb',
  'roe',
  'debt_to_equity',
  'profit_margin',
  'sector',
] as const;

const SOURCE_IDS = ['dse', 'stockanalysis', 'stockanalysis_statistics', 'lankabd', 'amarstock'] as const;

function parseArgs(argv: string[]): string[] {
  const tickers: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticker' && argv[i + 1]) {
      tickers.push(argv[++i]!.toUpperCase());
    }
  }
  return tickers.length ? tickers : ['ACI'];
}

function fmt(field: string, v: unknown): string {
  if (v == null || v === '') return '—';
  if (field === 'sector') return String(v);
  if (field === 'market_cap') {
    const n = Number(v);
    if (n >= 1e9) return `৳${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `৳${(n / 1e6).toFixed(2)}M`;
    return String(n);
  }
  if (field === 'dividend_yield' || field === 'roe' || field === 'profit_margin') {
    return `${(Number(v) * 100).toFixed(2)}%`;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
}

function disagree(field: string, values: number[]): boolean {
  if (values.length < 2) return false;
  if (field === 'eps_ttm') return true; // different EPS bases (TTM vs quarterly) always flagged
  if (field === 'market_cap') {
    const max = Math.max(...values);
    const min = Math.min(...values);
    return max > 0 && (max - min) / max > 0.03;
  }
  if (field === 'dividend_yield' || field === 'roe' || field === 'profit_margin') {
    const spread = Math.max(...values) - Math.min(...values);
    return spread > 0.005;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === 0) return false;
  return (max - min) / Math.abs(max) > 0.08;
}

async function fetchSource(id: (typeof SOURCE_IDS)[number], ticker: string) {
  switch (id) {
    case 'dse': {
      const html = await fetchText(`https://www.dsebd.org/displayCompany.php?name=${ticker}`);
      return html ? parseDseCompanyHtml(html) : {};
    }
    case 'stockanalysis':
      return fetchStockAnalysisFundamentals(ticker);
    case 'stockanalysis_statistics':
      return fetchStockAnalysisStatistics(ticker);
    case 'lankabd':
      return fetchLankabdFundamentals(ticker);
    case 'amarstock':
      return fetchAmarStockFundamentals(ticker);
  }
}

async function verifyTicker(ticker: string): Promise<void> {
  console.log(`\n${'='.repeat(72)}\n  ${ticker} — cross-source fundamentals\n${'='.repeat(72)}`);

  const sources: { id: string; payload: Record<string, unknown> }[] = [];
  for (const id of SOURCE_IDS) {
    try {
      const payload = await fetchSource(id, ticker);
      if (Object.keys(payload).length) sources.push({ id, payload });
    } catch (err) {
      console.warn(`  [warn] ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (sources.length === 0) {
    console.log('  No data from any source.');
    return;
  }

  const merged = mergeFundamentals(sources);

  for (const field of FIELDS) {
    const bySource: { id: string; raw: unknown; text: string }[] = [];
    for (const s of sources) {
      const raw = s.payload[field];
      if (raw != null && raw !== '') bySource.push({ id: s.id, raw, text: fmt(field, raw) });
    }
    if (bySource.length === 0) continue;

    const nums = bySource.map((b) => Number(b.raw)).filter((n) => Number.isFinite(n));
    const flag = nums.length > 1 && disagree(field, nums) ? ' ⚠ sources disagree' : '';
    const winner = merged.fieldSources[field];
    const mergedVal = merged.payload[field];

    console.log(`\n  ${field}${flag}`);
    for (const b of bySource) {
      const mark = b.id === winner ? ' ← merged' : '';
      console.log(`    ${b.id.padEnd(26)} ${b.text}${mark}`);
    }
    if (mergedVal == null && bySource.length > 0) {
      console.log(`    merged                   — (excluded by policy)`);
    }
  }

  console.log(`\n  Composite source: ${merged.compositeSource}`);
  console.log('  Notes:');
  console.log('    • eps_ttm: StockAnalysis=TTM; DSE/Lankabd=quarterly/audited (disagreement expected)');
  console.log('    • pe omitted when eps_ttm ≤ 0 (loss-making)');
  console.log('    • AmarStock returns empty without authenticated API session');
}

async function main(): Promise<void> {
  const tickers = parseArgs(process.argv.slice(2));
  for (const ticker of tickers) {
    await verifyTicker(ticker);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
