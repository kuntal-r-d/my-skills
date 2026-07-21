/**
 * Consolidated daily momentum "should I buy tomorrow?" verdict.
 *
 * Pure, dependency-free reducer over the analysis snapshot payload the pipeline
 * already produces (momentum_trading strategies + trade plans, synthesis, technical
 * agent card). Adds an overbought / over-extension guard so a strong-momentum name
 * that has run too far ahead of its 10-day MA is downgraded to "wait for pullback".
 */

export type BuyVerdict = 'BUY' | 'WAIT' | 'WATCH' | 'AVOID';

export interface DailyBuySignal {
  asOf: string | null;
  verdict: BuyVerdict;
  /** 0-1 model confidence, reduced when the extension guard fires. */
  confidence: number;
  /** Suggested entry (BDT), or the nearest watch-trigger when nothing is actionable. */
  entry: number | null;
  stop: number | null;
  target: number | null;
  /** Highest-scoring actionable strategy, else highest-scoring strategy overall. */
  primaryStrategy: string | null;
  /** Count of strategies that are actionable buys right now. */
  actionableCount: number;
  rsi: number | null;
  /** Percent the last close sits above (+) or below (-) the 10-day MA. */
  pctVs10ma: number | null;
  /** One concise human-readable line. */
  rationale: string;
}

interface OhlcvLike {
  close: number;
}

interface TradePlan {
  status?: string;
  direction?: string;
  entry?: number | null;
  stop_loss?: number | null;
  take_profit_1?: number | null;
}

interface StrategyRecord {
  score?: number;
  key_metrics?: {
    rsi?: number | null;
    trade_plan?: TradePlan | null;
  };
}

const RSI_OVERBOUGHT = 73;
const MA10_EXTENSION = 1.08; // 8% above the 10-day MA counts as extended

/** Reversal / bottom-fishing strategy — not a trend buy on its own in a downtrend. */
const REVERSAL_STRATEGY = 'failure_test_reversal';

/** Strategies whose trade plan is a genuine long entry we can act on tomorrow. */
function isActionableBuy(plan: TradePlan | null | undefined): plan is TradePlan {
  return Boolean(plan && plan.status === 'actionable' && plan.direction === 'buy');
}

/** Friendly label for a strategy key (minervini_sepa -> Minervini). */
function strategyLabel(key: string): string {
  const map: Record<string, string> = {
    minervini_sepa: 'Minervini',
    can_slim: 'CAN SLIM',
    darvas_box: 'Darvas',
    livermore_pivot: 'Livermore',
    failure_test_reversal: 'Failure-Test',
  };
  return map[key] ?? key;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Read RSI(14) from the payload — failure-test-reversal carries it, technical card as fallback. */
function extractRsi(
  strategies: Record<string, StrategyRecord>,
  technicalKm: Record<string, unknown>,
): number | null {
  const ftrRsi = num(strategies.failure_test_reversal?.key_metrics?.rsi);
  if (ftrRsi !== null) return ftrRsi;
  return num(technicalKm.rsi_14);
}

/** 10-day simple MA of the last 10 closes, and the last close, from OHLCV when available. */
function extractPriceAndMa10(ohlcv: OhlcvLike[] | undefined): { price: number | null; ma10: number | null } {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) return { price: null, ma10: null };
  const closes = ohlcv
    .map((bar) => num(bar?.close))
    .filter((c): c is number => c !== null);
  if (closes.length === 0) return { price: null, ma10: null };
  const price = closes[closes.length - 1];
  const window = closes.slice(-10);
  const ma10 = window.reduce((sum, c) => sum + c, 0) / window.length;
  return { price, ma10 };
}

/**
 * Compute the consolidated daily buy verdict.
 *
 * @param analysisPayload the persisted / read analysis snapshot payload
 * @param ohlcv optional daily bars (from the contract) used to derive price and the
 *   10-day MA for the extension guard. When omitted, the guard falls back to RSI only.
 */
export function computeDailyBuySignal(
  analysisPayload: Record<string, unknown>,
  ohlcv?: OhlcvLike[],
): DailyBuySignal {
  const momentumTrading = (analysisPayload.momentum_trading as Record<string, unknown>) ?? {};
  const strategies = (momentumTrading.strategies as Record<string, StrategyRecord>) ?? {};
  const summary = (momentumTrading.summary as Record<string, unknown>) ?? {};
  const synthesis = (analysisPayload.synthesis as Record<string, unknown>) ?? {};
  const synthMomentum = (synthesis.momentum as Record<string, unknown>) ?? {};
  const technical = ((analysisPayload.agent_cards as Record<string, unknown>)?.technical as Record<string, unknown>) ?? {};
  const technicalKm = (technical.key_metrics as Record<string, unknown>) ?? {};
  const technicalSub = (technical.sub_scores as Record<string, unknown>) ?? {};

  const asOf =
    (typeof analysisPayload.as_of === 'string' ? analysisPayload.as_of : null) ??
    (typeof momentumTrading.as_of === 'string' ? momentumTrading.as_of : null);

  // --- Actionable buy strategies, ranked by strategy score --------------------
  const entries = Object.entries(strategies);
  const actionable = entries
    .filter(([, strat]) => isActionableBuy(strat?.key_metrics?.trade_plan))
    .sort((a, b) => (num(b[1].score) ?? 0) - (num(a[1].score) ?? 0));
  const actionableCount = actionable.length;
  // Actionable buys that are genuine trend strategies (exclude the reversal/bottom-fishing one).
  const trendActionable = actionable.filter(([key]) => key !== REVERSAL_STRATEGY);
  const trendActionableCount = trendActionable.length;

  // --- RSI, price, MA10 -------------------------------------------------------
  const rsi = extractRsi(strategies, technicalKm);
  const { price, ma10 } = extractPriceAndMa10(ohlcv);
  const pctVs10ma = price !== null && ma10 !== null && ma10 !== 0 ? ((price / ma10) - 1) * 100 : null;

  // --- Trend / downtrend signal (for the AVOID base) --------------------------
  const trendSub = num(technicalSub.trend);
  const sma50 = num(technicalKm.sma_50);
  const sma200 = num(technicalKm.sma_200);
  const synthRating = typeof synthMomentum.rating === 'string' ? (synthMomentum.rating as string).toLowerCase() : '';
  const belowKeyMas =
    price !== null && sma50 !== null && sma200 !== null ? price < sma50 && price < sma200 : false;
  const downtrend =
    (trendSub !== null && trendSub < 0) ||
    belowKeyMas ||
    synthRating === 'sell' ||
    synthRating === 'avoid';

  // --- Base verdict -----------------------------------------------------------
  // In a downtrend, only genuine trend strategies count — a lone failure-test
  // reversal attempt on a falling stock is not a lean-buy. Fewer than 2 trend-strategy
  // actionable buys in a downtrend resolves to AVOID.
  let verdict: BuyVerdict;
  let lonelyReversalInDowntrend = false;
  if (downtrend) {
    if (trendActionableCount >= 2) {
      verdict = 'BUY';
    } else {
      verdict = 'AVOID';
      // Preserve the reversal flag: a single failure-test actionable buy is present but not a trend buy.
      lonelyReversalInDowntrend = actionableCount > trendActionableCount;
    }
  } else if (actionableCount >= 2) {
    verdict = 'BUY';
  } else {
    // exactly 1 actionable (lean-buy, setup forming) or 0 without a downtrend
    verdict = 'WATCH';
  }

  // --- Overbought / over-extension guard --------------------------------------
  let guardFired = false;
  let guardNote = '';
  let guardUnavailable = false;
  if (verdict === 'BUY') {
    const rsiHot = rsi !== null && rsi >= RSI_OVERBOUGHT;
    const extended = price !== null && ma10 !== null && price >= MA10_EXTENSION * ma10;
    if (rsi === null && ma10 === null) {
      guardUnavailable = true;
    } else if (rsiHot || extended) {
      guardFired = true;
      verdict = 'WAIT';
      const parts: string[] = [];
      if (rsiHot && rsi !== null) parts.push(`RSI ${rsi.toFixed(0)}`);
      if (extended && pctVs10ma !== null) parts.push(`+${pctVs10ma.toFixed(0)}% vs 10-MA`);
      guardNote = `extended/overbought (${parts.join(' / ')}) - wait for pullback`;
    }
  }

  // --- Levels -----------------------------------------------------------------
  let entry: number | null = null;
  let stop: number | null = null;
  let target: number | null = null;
  let levelIsWatch = false;

  if (actionableCount > 0) {
    // Most conservative (lowest) actionable entry, with its own stop/target.
    let best: TradePlan | null = null;
    for (const [, strat] of actionable) {
      const plan = strat.key_metrics?.trade_plan;
      const e = num(plan?.entry);
      if (e === null) continue;
      if (best === null || e < (num(best.entry) ?? Infinity)) best = plan ?? null;
    }
    if (best) {
      entry = num(best.entry);
      stop = num(best.stop_loss);
      target = num(best.take_profit_1);
    }
  } else {
    // Nothing actionable: surface the nearest strategy's trigger levels as a watch-trigger.
    levelIsWatch = true;
    const ranked = entries
      .filter(([, strat]) => num(strat?.key_metrics?.trade_plan?.entry) !== null)
      .sort((a, b) => (num(b[1].score) ?? 0) - (num(a[1].score) ?? 0));
    const nearest = ranked[0]?.[1]?.key_metrics?.trade_plan;
    if (nearest) {
      entry = num(nearest.entry);
      stop = num(nearest.stop_loss);
      target = num(nearest.take_profit_1);
    }
  }

  // --- Primary strategy -------------------------------------------------------
  let primaryStrategy: string | null = null;
  if (actionable.length > 0) {
    primaryStrategy = actionable[0][0];
  } else if (entries.length > 0) {
    const ranked = [...entries].sort((a, b) => (num(b[1].score) ?? 0) - (num(a[1].score) ?? 0));
    primaryStrategy = ranked[0][0];
  }

  // --- Confidence -------------------------------------------------------------
  // consensus_score is already 0-1; synthesis composite_1_10 is 1-10.
  const consensus = num(summary.consensus_score);
  const composite = num(synthMomentum.composite_1_10);
  let confidence = consensus !== null ? consensus : composite !== null ? composite / 10 : 0.5;
  confidence = Math.max(0, Math.min(1, confidence));
  if (guardFired) confidence *= 0.7; // reduced because the guard fired
  confidence = Math.round(confidence * 100) / 100;

  // --- Rationale --------------------------------------------------------------
  const totalStrategies = entries.length;
  const actionableNames = actionable.map(([k]) => strategyLabel(k));
  const rsiPhrase = rsi !== null ? `RSI ${rsi.toFixed(0)}` : 'RSI n/a';

  let rationale: string;
  if (guardFired) {
    const strong = actionableNames.length ? `${actionableCount}/${totalStrategies} actionable (${actionableNames.join(', ')})` : 'Strong momentum';
    rationale = `${strong} but ${guardNote}`;
  } else if (verdict === 'BUY') {
    const extPhrase = guardUnavailable ? `${rsiPhrase}, extension guard unavailable` : `${rsiPhrase}, not extended`;
    rationale = `${actionableCount}/${totalStrategies} strategies actionable (${actionableNames.join(', ')}); ${extPhrase}`;
  } else if (verdict === 'WATCH' && actionableCount === 1) {
    rationale = `${actionableCount}/${totalStrategies} actionable (${actionableNames.join(', ')}) - setup forming, lean-buy; ${rsiPhrase}`;
  } else if (verdict === 'WATCH') {
    rationale = levelIsWatch && entry !== null
      ? `No actionable buys yet - watch trigger near ${entry} (${primaryStrategy ? strategyLabel(primaryStrategy) : 'top strategy'}); ${rsiPhrase}`
      : `No actionable buys yet - stand aside and watch; ${rsiPhrase}`;
  } else {
    // AVOID
    rationale = lonelyReversalInDowntrend
      ? `Downtrend; only a failure-test reversal attempt present - not a trend buy; ${rsiPhrase}`
      : `No trend buys and price in a downtrend - avoid; ${rsiPhrase}`;
  }

  return {
    asOf: asOf ?? null,
    verdict,
    confidence,
    entry,
    stop,
    target,
    primaryStrategy,
    actionableCount,
    rsi,
    pctVs10ma: pctVs10ma !== null ? Math.round(pctVs10ma * 10) / 10 : null,
    rationale,
  };
}
