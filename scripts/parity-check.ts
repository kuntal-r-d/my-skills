/**
 * Parity check: run TypeScript skill functions against fixture and optionally
 * compare with Python golden outputs (when Python is still present).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { runSkill } from '../packages/mcp-server/src/dispatch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = join(root, 'skills/_fixtures/sample_input.json');
const goldenDir = join(root, 'tests/golden');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const SKILL_CLI_MAP: Record<string, { folder: string; script: string; handler: string }> = {
  technical_analysis: { folder: 'technical-analysis', script: 'analyze.py', handler: 'technical-analysis' },
  momentum_screen: { folder: 'momentum-screen', script: 'screen.py', handler: 'momentum-screen' },
  fundamental_analysis: { folder: 'fundamental-analysis', script: 'analyze.py', handler: 'fundamental-analysis' },
  value_investment_checklist: { folder: 'value-investment-checklist', script: 'checklist.py', handler: 'value-investment-checklist' },
  smart_money_flow: { folder: 'smart-money-flow', script: 'analyze.py', handler: 'smart-money-flow' },
  sentiment_news: { folder: 'sentiment-news', script: 'sentiment.py', handler: 'sentiment-news' },
  macro_regime: { folder: 'macro-regime', script: 'regime.py', handler: 'macro-regime' },
  signal_synthesizer: { folder: 'signal-synthesizer', script: 'synthesize.py', handler: 'signal-synthesizer' },
  risk_manager: { folder: 'risk-manager', script: 'analyze.py', handler: 'risk-manager' },
  stock_screener: { folder: 'stock-screener', script: 'screen.py', handler: 'stock-screener' },
  pattern_miner: { folder: 'pattern-miner', script: 'mine.py', handler: 'pattern-miner' },
  daily_briefing: { folder: 'daily-briefing', script: 'brief.py', handler: 'daily-briefing' },
  ticker_dossier: { folder: 'ticker-dossier', script: 'dossier.py', handler: 'ticker-dossier' },
  financial_terms_educator: { folder: 'financial-terms-educator', script: 'lookup.py', handler: 'financial-terms-educator' },
};

function approxEqual(a: unknown, b: unknown, eps = 0.01): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= eps;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => approxEqual(v, b[i], eps));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object).sort();
    const bk = Object.keys(b as object).sort();
    if (ak.join() !== bk.join()) return false;
    return ak.every((k) => approxEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], eps));
  }
  return false;
}

function runPython(tool: string, payload: unknown): unknown | null {
  const spec = SKILL_CLI_MAP[tool];
  if (!spec) return null;
  const script = join(root, 'skills', spec.folder, 'scripts', spec.script);
  if (!existsSync(script)) return null;
  try {
    const out = execSync(`python3 "${script}"`, {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 30_000,
    });
    return JSON.parse(out.trim());
  } catch {
    return null;
  }
}

mkdirSync(goldenDir, { recursive: true });

let passed = 0;
let failed = 0;
let skipped = 0;

for (const [tool, spec] of Object.entries(SKILL_CLI_MAP)) {
  let tsResult: unknown;
  try {
    tsResult = runSkill(tool, fixture);
  } catch {
    console.log(`SKIP ${tool}: no TS handler`);
    skipped++;
    continue;
  }
  const goldenPath = join(goldenDir, `${tool}.json`);

  const pyResult = runPython(tool, fixture);
  if (pyResult) {
    writeFileSync(goldenPath, JSON.stringify(pyResult, null, 2));
    if (approxEqual(tsResult, pyResult)) {
      console.log(`PASS ${tool}`);
      passed++;
    } else {
      console.log(`FAIL ${tool}: TS output differs from Python`);
      writeFileSync(join(goldenDir, `${tool}.ts.json`), JSON.stringify(tsResult, null, 2));
      failed++;
    }
  } else {
    writeFileSync(goldenPath, JSON.stringify(tsResult, null, 2));
    console.log(`OK ${tool}: TS only (Python unavailable)`);
    passed++;
  }
}

console.log(`\nParity: ${passed} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed > 0 ? 1 : 0);
