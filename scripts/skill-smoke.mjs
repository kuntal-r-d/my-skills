#!/usr/bin/env node
/**
 * Smoke-test each skill CLI with a minimal valid payload.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(join(root, 'skills/_fixtures/sample_input.json'), 'utf8'));

const CASES = [
  { skill: 'technical-analysis', script: 'analyze.js', payload: fixture },
  { skill: 'momentum-screen', script: 'screen.js', payload: fixture },
  { skill: 'fundamental-analysis', script: 'analyze.js', payload: fixture },
  { skill: 'value-investment-checklist', script: 'checklist.js', payload: fixture },
  { skill: 'smart-money-flow', script: 'analyze.js', payload: fixture },
  { skill: 'sentiment-news', script: 'sentiment.js', payload: fixture },
  { skill: 'macro-regime', script: 'regime.js', payload: fixture },
  { skill: 'risk-manager', script: 'analyze.js', payload: { ...fixture, signal: { mode: 'momentum', score: 0.5 } } },
  {
    skill: 'signal-synthesizer',
    script: 'synthesize.js',
    payload: {
      ticker: fixture.ticker,
      as_of: fixture.as_of,
      agents: {
        technical: { score: 0.5, confidence: 0.7 },
        fundamental: { score: 0.3, confidence: 0.6 },
      },
    },
  },
  {
    skill: 'stock-screener',
    script: 'screen.js',
    payload: {
      universe: [{ ticker: 'GP', fundamentals: fixture.fundamentals, ohlcv: fixture.ohlcv?.slice(-30) }],
      mode: 'momentum',
      limit: 5,
    },
  },
  { skill: 'pattern-miner', script: 'mine.js', payload: fixture },
  { skill: 'daily-briefing', script: 'brief.js', payload: { portfolio: [], watchlist: [fixture.ticker], as_of: fixture.as_of, macro_regime: { rating: 'neutral' } } },
  { skill: 'ticker-dossier', script: 'dossier.js', payload: { ticker: fixture.ticker, cards: {}, data: fixture } },
  { skill: 'financial-terms-educator', script: 'lookup.js', payload: { term: 'P/E Ratio' } },
];

let failed = 0;

for (const { skill, script, payload } of CASES) {
  const path = join(root, 'skills', skill, 'scripts', script);
  try {
    const out = execFileSync('node', [path], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 30_000,
    });
    const result = JSON.parse(out.trim());
    if (result.error) {
      console.error(`FAIL ${skill}: ${result.error}`);
      failed++;
    } else {
      console.log(`PASS ${skill}`);
    }
  } catch (err) {
    console.error(`FAIL ${skill}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
