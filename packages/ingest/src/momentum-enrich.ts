import { buildMomentumTrading, hasMomentumTrading } from './momentum-trading.js';

/** Re-run momentum strategies when snapshot predates momentum_trading output. */
export async function enrichMomentumInAnalysis(
  analysis: Record<string, unknown>,
  contractPayload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (hasMomentumTrading(analysis)) return analysis;
  try {
    const momentumTrading = await buildMomentumTrading(contractPayload);
    if (!hasMomentumTrading({ momentum_trading: momentumTrading })) {
      return {
        ...analysis,
        momentum_enrich_skipped: 'coordinator returned no summary.buckets',
      };
    }
    return {
      ...analysis,
      momentum_trading: momentumTrading,
      momentum_rotation: momentumTrading.momentum_rotation ?? analysis.momentum_rotation,
      momentum_enriched: true,
    };
  } catch (err) {
    return {
      ...analysis,
      momentum_enrich_error: err instanceof Error ? err.message : String(err),
    };
  }
}
