import { buildMomentumTrading, hasMomentumTrading } from './momentum-trading.js';
import { computeDailyBuySignal } from './buy-signal.js';

/** Attach the consolidated daily buy signal, computed from the (possibly just-enriched) payload. */
function withDailyBuySignal(
  analysis: Record<string, unknown>,
  contractPayload: Record<string, unknown>,
): Record<string, unknown> {
  if (analysis.daily_buy_signal) return analysis;
  try {
    const ohlcv = (contractPayload.ohlcv as import('@stock-buddy/core').OhlcvBar[]) ?? [];
    return { ...analysis, daily_buy_signal: computeDailyBuySignal(analysis, ohlcv) };
  } catch (err) {
    return { ...analysis, buy_signal_error: err instanceof Error ? err.message : String(err) };
  }
}

/** Re-run momentum strategies when snapshot predates momentum_trading output. */
export async function enrichMomentumInAnalysis(
  analysis: Record<string, unknown>,
  contractPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (hasMomentumTrading(analysis)) return withDailyBuySignal(analysis, contractPayload);
  try {
    const momentumTrading = await buildMomentumTrading(contractPayload);
    if (!hasMomentumTrading({ momentum_trading: momentumTrading })) {
      return {
        ...analysis,
        momentum_enrich_skipped: 'coordinator returned no summary.buckets',
      };
    }
    return withDailyBuySignal(
      {
        ...analysis,
        momentum_trading: momentumTrading,
        momentum_rotation: momentumTrading.momentum_rotation ?? analysis.momentum_rotation,
        momentum_enriched: true,
      },
      contractPayload,
    );
  } catch (err) {
    return {
      ...analysis,
      momentum_enrich_error: err instanceof Error ? err.message : String(err),
    };
  }
}
