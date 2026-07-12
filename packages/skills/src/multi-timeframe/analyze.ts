import { analyzeMultiTimeframe, resampleToWeekly, splitOhlcv, type OhlcvBar } from '@stock-buddy/core';
import { detectDarvasBox } from '../momentum-shared/boxes.js';

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as OhlcvBar[]) ?? [];
  if (ohlcv.length < 50) {
    return {
      skill: 'multi-timeframe',
      error: 'need >=50 OHLCV bars',
      bars_supplied: ohlcv.length,
    };
  }

  const mtf = analyzeMultiTimeframe(ohlcv);
  const [, h, l, c, v] = splitOhlcv(ohlcv);

  const weeklyBars = (data.ohlcv_weekly as OhlcvBar[]) ?? resampleToWeekly(ohlcv);
  const darvas =
    weeklyBars.length >= 30
      ? detectDarvasBox(
          weeklyBars.map((b) => b.high),
          weeklyBars.map((b) => b.low),
          weeklyBars.map((b) => b.close),
          weeklyBars.map((b) => b.volume ?? 0),
          20,
        )
      : detectDarvasBox(h, l, c, v, 25);

  return {
    skill: 'multi-timeframe',
    ticker: data.ticker,
    as_of: data.as_of,
    mode: data.mode,
    ...mtf,
    weekly_darvas_box: darvas
      ? { in_box: darvas.in_box, breakout: darvas.breakout, box_high: darvas.box_high }
      : null,
    score: mtf.confluence_score,
    rating:
      mtf.alignment === 'bullish'
        ? 'aligned_bullish'
        : mtf.alignment === 'bearish'
          ? 'aligned_bearish'
          : 'mixed',
    confidence: Math.min(0.95, 0.5 + mtf.confluence_score * 0.45),
    key_metrics: {
      confluence_score: mtf.confluence_score,
      alignment: mtf.alignment,
      conflict_count: mtf.conflicts.length,
      daily_trend: mtf.daily.trend,
      weekly_stage: mtf.weekly.stage,
      monthly_stage: mtf.monthly.stage,
    },
    reasoning: [
      `Daily: ${mtf.daily.trend} (${mtf.daily.ma_stack ?? 'n/a'})`,
      `Weekly: stage ${mtf.weekly.stage ?? '?'}, ${mtf.weekly.structure}`,
      `Monthly: stage ${mtf.monthly.stage ?? '?'}, ${mtf.monthly.trend}`,
      mtf.conflicts.length
        ? `Conflicts: ${mtf.conflicts.join(', ')}`
        : 'No major timeframe conflicts',
    ],
    flags: mtf.conflicts,
  };
}
