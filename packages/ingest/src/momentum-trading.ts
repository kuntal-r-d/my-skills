import { MomentumStrategiesCoordinator } from '@stock-buddy/agents';
import { computeMomentumRotation } from './rotation.js';
import { buildMarketStructure, buildMultiTimeframeBlock } from './market-structure.js';

export function hasMomentumTrading(analysis: unknown): boolean {
  const mt = (analysis as Record<string, unknown>)?.momentum_trading as Record<string, unknown> | undefined;
  const summary = mt?.summary as Record<string, unknown> | undefined;
  return Boolean(summary?.buckets);
}

export async function buildMomentumTrading(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const ohlcv = (payload.ohlcv as import('@stock-buddy/core').OhlcvBar[]) ?? [];
  const rotation = computeMomentumRotation(ohlcv) as unknown as Record<string, unknown>;
  const coord = new MomentumStrategiesCoordinator();
  const result = await coord.analyze(payload, rotation);
  const market_structure = buildMarketStructure(payload);
  const multi_timeframe = buildMultiTimeframeBlock(payload);
  return { ...result, market_structure, multi_timeframe } as Record<string, unknown>;
}

export async function enrichMomentumTrading(
  analysis: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (hasMomentumTrading(analysis)) return analysis;

  try {
    const momentumTrading = await buildMomentumTrading(payload);
    const stages = { ...(analysis.stages as Record<string, string> ?? {}) };
    for (const key of [
      'minervini_sepa',
      'can_slim',
      'darvas_box',
      'livermore_pivot',
      'stage_analysis',
      'dow_theory',
      'launchpad',
      'multi_timeframe',
    ]) {
      const strat =
        key === 'stage_analysis' || key === 'dow_theory' || key === 'launchpad'
          ? (momentumTrading.market_structure as Record<string, unknown>)?.[
              key === 'stage_analysis' ? 'stage_analysis' : key === 'dow_theory' ? 'dow_theory' : 'launchpad'
            ]
          : key === 'multi_timeframe'
            ? momentumTrading.multi_timeframe
            : (momentumTrading.strategies as Record<string, unknown>)?.[key];
      stages[key] = strat && !('error' in (strat as object)) ? 'ok' : 'skipped';
    }
    return {
      ...analysis,
      momentum_trading: momentumTrading,
      momentum_rotation: momentumTrading.momentum_rotation ?? analysis.momentum_rotation,
      stages,
      momentum_enriched: true,
    };
  } catch (err) {
    return {
      ...analysis,
      momentum_enrich_error: err instanceof Error ? err.message : String(err),
    };
  }
}
