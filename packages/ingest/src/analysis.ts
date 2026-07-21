import {
  getTickerBySymbol,
  recordIngestRun,
  saveAnalysisSnapshot,
  updateFreshness,
  type Db,
} from '@stock-buddy/db';
import { analyzeTicker, screenMarket, runSkill } from '@stock-buddy/mcp-server/composites';
import { injectIntrinsicValue } from '@stock-buddy/core';
import { buildTickerContract, stripMeta } from './contract-builder.js';
import { computeMomentumRotation } from './rotation.js';
import { enrichRiskInAnalysis } from './risk-enrich.js';
import { enrichMomentumTrading } from './momentum-trading.js';
import { computeDailyBuySignal } from './buy-signal.js';

const MCP_VERSION = '2.0.0';

export type AnalysisMode = 'standard' | 'investment' | 'momentum' | 'full';

export interface RunAnalysisOptions {
  includePortfolio?: boolean;
  ohlcvDays?: number;
  clientId?: string;
  persist?: boolean;
  mode?: AnalysisMode;
}

function runSkillSafe(tool: string, payload: Record<string, unknown>): Record<string, unknown> | null {
  try {
    const result = runSkill(tool, payload);
    if (result && 'error' in result) return null;
    return result;
  } catch {
    return null;
  }
}

/** Build contract from DB, run analysis pipeline, optionally persist snapshot. */
export async function runTickerAnalysis(
  db: Db,
  symbol: string,
  opts: RunAnalysisOptions = {},
): Promise<{
  analysis: Record<string, unknown>;
  snapshotId?: number;
}> {
  const mode = opts.mode ?? 'full';
  const ohlcvDays =
    opts.ohlcvDays ??
    (mode === 'momentum' || mode === 'full' ? 520 : 260);
  const contract = await buildTickerContract(db, symbol, {
    includePortfolio: opts.includePortfolio ?? true,
    ohlcvDays,
    mode: mode === 'investment' ? 'investment' : 'momentum',
  });
  const payload = stripMeta(contract);
  payload.mode = mode === 'investment' ? 'investment' : mode === 'momentum' ? 'momentum' : payload.mode;

  let analysis: Record<string, unknown>;

  if (mode === 'standard') {
    analysis = analyzeTicker(payload);
  } else {
    analysis = analyzeTicker(payload);
    const stages = { ...(analysis.stages as Record<string, string> ?? {}) };

    if (mode === 'full' || mode === 'momentum') {
      analysis = await enrichMomentumTrading(analysis, payload);
      Object.assign(stages, (analysis.stages as Record<string, string>) ?? {});
    }

    if (mode === 'full' || mode === 'investment') {
      const cards = analysis.agent_cards as Record<string, unknown> | undefined;
      const fundCard = cards?.fundamental as Record<string, unknown> | undefined;
      const enrichedFundamentals = injectIntrinsicValue(
        (payload.fundamentals as Record<string, unknown>) ?? {},
        fundCard,
      );
      payload.fundamentals = enrichedFundamentals;

      const val = runSkillSafe('value_investment_checklist', payload);
      if (val) {
        analysis.value_investment_checklist = val;
        stages.value_investment_checklist = 'ok';
      } else stages.value_investment_checklist = 'skipped';
    }

    const ohlcv = (payload.ohlcv as import('@stock-buddy/core').OhlcvBar[]) ?? [];
    if (!analysis.momentum_rotation) {
      analysis.momentum_rotation = computeMomentumRotation(ohlcv);
    }

    analysis.stages = stages;
    analysis.analysis_mode = mode;
  }

  analysis = enrichRiskInAnalysis(analysis, payload);

  const ohlcvBars = (payload.ohlcv as import('@stock-buddy/core').OhlcvBar[]) ?? [];
  analysis.daily_buy_signal = computeDailyBuySignal(analysis, ohlcvBars);

  let snapshotId: number | undefined;
  if (opts.persist ?? true) {
    const ticker = await getTickerBySymbol(db, symbol);
    if (ticker) {
      const row = await saveAnalysisSnapshot(db, {
        tickerId: ticker.id,
        skill: 'analyze_ticker',
        asOf: String(analysis.as_of ?? contract.as_of),
        payload: analysis,
        clientId: opts.clientId,
        modelVersion: MCP_VERSION,
      });
      snapshotId = row.id;
    }
  }

  return { analysis, snapshotId };
}

export async function ingestAnalysis(db: Db, symbol: string): Promise<number> {
  const started = new Date();
  const ticker = await getTickerBySymbol(db, symbol);
  if (!ticker) {
    throw new Error(`Ticker not found: ${symbol}`);
  }

  try {
    const { snapshotId } = await runTickerAnalysis(db, symbol, { persist: true, mode: 'full' });
    await recordIngestRun(db, {
      jobName: 'ingest_analysis',
      tickerId: ticker.id,
      status: 'ok',
      rowsUpserted: 1,
      source: 'skills',
      startedAt: started,
    });
    await updateFreshness(db, 'analysis', ticker.id, true, 24);
    return snapshotId ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordIngestRun(db, {
      jobName: 'ingest_analysis',
      tickerId: ticker.id,
      status: 'failed',
      errorMessage: message,
      startedAt: started,
    });
    await updateFreshness(db, 'analysis', ticker.id, false, 24);
    throw err;
  }
}

export { screenMarket };
