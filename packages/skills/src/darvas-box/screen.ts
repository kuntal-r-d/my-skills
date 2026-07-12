import * as ind from '@stock-buddy/core';
import { detectDarvasBox } from '../momentum-shared/boxes.js';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';

const CATEGORY_WEIGHTS = {
  box: 0.35,
  breakout: 0.35,
  risk: 0.30,
};

const CATEGORY_CRITERIA: Record<string, number[]> = {
  box: [1, 2, 3, 4],
  breakout: [5, 6, 7],
  risk: [8, 9, 10],
};

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  if (ohlcv.length < 30) {
    return { skill: 'darvas-box', error: 'need >=30 OHLCV bars', bars_supplied: ohlcv.length };
  }

  const [, h, l, c, v] = ind.splitOhlcv(ohlcv);
  const px = c[c.length - 1]!;
  const flags: string[] = [];
  const box = detectDarvasBox(h, l, c, v);

  if (!box) {
    return { skill: 'darvas-box', error: 'insufficient bars for box detection', bars_supplied: ohlcv.length };
  }

  const avg20Vol = ind.lastValid(ind.sma(v, 20)) ?? 1;
  const relVol = v[v.length - 1]! / avg20Vol;
  const stopDist = px > 0 ? ((px - box.box_stop) / px) * 100 : null;
  const atrV = ind.lastValid(ind.atr(h, l, c, 14)) ?? 0;
  const atrRatio = px ? atrV / px : null;

  const col = new CriterionCollector();

  col.add('box', 'Trading inside a defined box', box.in_box || box.at_upper_box,
    'Darvas box: price consolidating between clear high and low.', { box_high: box.box_high, box_low: box.box_low });
  col.add('box', 'Box range reasonably tight (< 25% width)', box.box_width_pct < 25,
    'A tight box shows controlled consolidation.', { box_width_pct: box.box_width_pct });
  col.add('box', 'Box tightening (VCP-style contraction)', box.tightening,
    'Each box narrower than the prior — sellers exhausted.', { contraction_pct: box.contraction_pct });
  col.add('box', 'Price at upper half of box', box.at_upper_box,
    'Holding upper box shows buyers in control.', { close: px, box_mid: (box.box_high + box.box_low) / 2 });

  col.add('breakout', 'Breakout above box high', box.breakout,
    'Buy signal: price clears the box ceiling.', { box_high: box.box_high, close: px });
  col.add('breakout', 'Volume > 1.5x average on move', relVol > 1.5,
    'High volume validates institutional participation.', { relative_volume: relVol });
  col.add('breakout', 'Close above box high (or testing)', px > box.box_high * 0.99,
    'Price at or through the box top.', { close: px, box_high: box.box_high });

  col.add('risk', 'Stop at box floor defined', true,
    'Mechanical exit: stop at bottom of current box.', { box_stop: box.box_stop });
  col.add('risk', 'Stop distance acceptable (< 12%)', stopDist != null ? stopDist < 12 && stopDist > 0 : null,
    'Room for a defined risk from box floor.', { stop_distance_pct: stopDist });
  col.add('risk', 'ATR/price < 8%', atrRatio != null ? atrRatio < 0.08 : null,
    'Volatility not excessive for box trading.', { atr_ratio: atrRatio });

  return buildChecklistOutput({
    skill: 'darvas-box',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 10,
    extraKeyMetrics: {
      box_high: box.box_high,
      box_low: box.box_low,
      box_stop: box.box_stop,
      box_width_pct: box.box_width_pct,
      breakout: box.breakout,
      formulas: { relative_volume: Math.round(relVol * 100) / 100 },
    },
  });
}
