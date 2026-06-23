/** Composite tools that orchestrate the skill pipeline server-side (TAD ADR-007).
 *
 * analyze_ticker: leaf skills -> signal-synthesizer -> risk-manager, in one call.
 * screen_market:  thin wrapper over stock-screener.
 *
 * Each composite degrades gracefully: if a leaf errors, it records the failing
 * stage in `stages` and continues, rather than dropping the result silently.
 */
import { runSkill, SkillError } from './dispatch.js';

const LEAVES: Record<string, string> = {
  technical_analysis: 'technical',
  fundamental_analysis: 'fundamental',
  smart_money_flow: 'smart_money',
  sentiment_news: 'sentiment',
  macro_regime: 'macro',
};

function scoreConf(card: Record<string, unknown>): { score: number; confidence: number } {
  return {
    score: Number(card.score ?? 0) || 0,
    confidence: Number(card.confidence ?? 0.5) || 0.5,
  };
}

/** Run the full pipeline for one ticker.
 *
 * `payload` is the shared data-contract object (ohlcv, fundamentals,
 * shareholding, news, macro, microstructure, account, ...).
 */
export function analyzeTicker(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const ticker = payload.ticker;
  const stages: Record<string, string> = {};
  const agents: Record<string, { score: number; confidence: number }> = {};
  const cards: Record<string, unknown> = {};

  for (const [tool, agentKey] of Object.entries(LEAVES)) {
    try {
      const card = runSkill(tool, payload);
      if ('error' in card) {
        stages[tool] = `skipped: ${String(card.error)}`;
        continue;
      }
      cards[agentKey] = card;
      agents[agentKey] = scoreConf(card);
      stages[tool] = 'ok';
    } catch (err) {
      stages[tool] = `error: ${err instanceof SkillError ? err.message : String(err)}`;
    }
  }

  if (Object.keys(agents).length === 0) {
    return {
      skill: 'analyze_ticker',
      ticker,
      error: 'no leaf analyses succeeded',
      stages,
    };
  }

  const synPayload: Record<string, unknown> = {
    ticker,
    as_of: payload.as_of,
    agents,
    microstructure: payload.microstructure,
  };

  let synthesis: Record<string, unknown>;
  try {
    synthesis = runSkill('signal_synthesizer', synPayload);
    stages.signal_synthesizer =
      'error' in synthesis ? `error: ${String(synthesis.error)}` : 'ok';
  } catch (err) {
    synthesis = { error: String(err instanceof SkillError ? err.message : err) };
    stages.signal_synthesizer = `error: ${err instanceof SkillError ? err.message : String(err)}`;
  }

  let risk: Record<string, unknown>;
  try {
    risk = runSkill('risk_manager', payload);
    stages.risk_manager = 'error' in risk ? `error: ${String(risk.error)}` : 'ok';
  } catch (err) {
    risk = { error: String(err instanceof SkillError ? err.message : err) };
    stages.risk_manager = `error: ${err instanceof SkillError ? err.message : String(err)}`;
  }

  return {
    skill: 'analyze_ticker',
    ticker,
    as_of: payload.as_of,
    synthesis,
    risk,
    agent_cards: cards,
    stages,
    disclaimer: 'Educational analysis only. Not financial advice.',
  };
}

/** Thin wrapper over stock-screener (kept as a composite for a stable name). */
export function screenMarket(payload: Record<string, unknown>): Record<string, unknown> {
  return runSkill('stock_screener', payload);
}

export interface CompositeSpec {
  fn: (payload: Record<string, unknown>) => Record<string, unknown>;
  description: string;
  reads: readonly string[];
}

export const COMPOSITES: Record<string, CompositeSpec> = {
  analyze_ticker: {
    fn: analyzeTicker,
    description:
      'End-to-end: run technical, fundamental, smart-money, sentiment and macro '
      + 'analyses, fuse them via signal-synthesizer (dual-mode 1-10 composite), and '
      + 'risk-check via risk-manager. One call, full pipeline, for a DSE ticker.',
    reads: [
      'ticker',
      'ohlcv',
      'fundamentals',
      'shareholding',
      'news',
      'macro',
      'microstructure',
      'account',
      'market_index',
      'as_of',
    ],
  },
  screen_market: {
    fn: screenMarket,
    description:
      'Scan a universe of DSE stocks for Investment or Momentum candidates via '
      + 'filters, a named template, or a natural-language query.',
    reads: ['universe', 'filters', 'template', 'query', 'mode', 'limit'],
  },
};
