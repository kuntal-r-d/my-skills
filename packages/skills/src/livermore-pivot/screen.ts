import * as ind from '@stock-buddy/core';
import { detectLivermorePivot } from '../momentum-shared/pivots.js';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';

const CATEGORY_WEIGHTS = {
  pivot: 0.35,
  volume: 0.30,
  risk: 0.35,
};

const CATEGORY_CRITERIA: Record<string, number[]> = {
  pivot: [1, 2, 3, 4],
  volume: [5, 6],
  risk: [7, 8, 9, 10],
};

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  if (ohlcv.length < 30) {
    return { skill: 'livermore-pivot', error: 'need >=30 OHLCV bars', bars_supplied: ohlcv.length };
  }

  const [, h, l, c, v] = ind.splitOhlcv(ohlcv);
  const px = c[c.length - 1]!;
  const flags: string[] = [];
  const mkt = (data.market_index as ind.OhlcvBar[]) ?? [];
  const pivotData = detectLivermorePivot(h, l, c, v);

  if (!pivotData) {
    return { skill: 'livermore-pivot', error: 'insufficient bars for pivot detection', bars_supplied: ohlcv.length };
  }

  const avg20Vol = ind.lastValid(ind.sma(v, 20)) ?? 1;
  const relVol = v[v.length - 1]! / avg20Vol;

  let mktAligned: boolean | null = null;
  if (mkt.length >= 13) {
    const mc = mkt.map((b) => Number(b.close));
    const prev = mc[mc.length - 13]!;
    const mktRoc = prev ? ((mc[mc.length - 1]! - prev) / prev) * 100 : 0;
    const stockUp = c.length >= 13 && c[c.length - 13]! ? px > c[c.length - 13]! : true;
    mktAligned = stockUp && mktRoc > 0;
  } else {
    flags.push('missing:market_index');
  }

  const abovePivotZone = px >= pivotData.pivot * 0.98;
  const notExtended = pivotData.prior_pivot != null ? px < pivotData.prior_pivot * 1.15 : true;
  const trailOk = pivotData.trail_stop != null ? px > pivotData.trail_stop : null;

  const col = new CriterionCollector();

  col.add('pivot', 'Pivot level identified', pivotData.pivot > 0,
    'Livermore pivot: consolidation high where momentum may accelerate.', { pivot: pivotData.pivot });
  col.add('pivot', 'Price crossed pivot (go signal)', pivotData.crossed,
    'Crossing the pivot on strength is the entry trigger.', { close: px, pivot: pivotData.pivot });
  col.add('pivot', 'At or above pivot zone', abovePivotZone,
    'Price holding pivot area shows acceptance.', { close: px, pivot: pivotData.pivot });
  col.add('pivot', 'Pyramiding levels mapped', pivotData.add_levels.length >= 1,
    'Scale-up only at higher pivot rungs — never average down.', { add_levels: pivotData.add_levels });

  col.add('volume', 'Volume confirms pivot cross', pivotData.volume_confirmed,
    'High volume on pivot cross validates the move.', { volume_confirmed: pivotData.volume_confirmed });
  col.add('volume', 'Volume > 20-day average', relVol > 1,
    'Participation above average on the pivot attempt.', { relative_volume: relVol });

  col.add('risk', 'No averaging down (price above trail)', trailOk,
    'Livermore rule: never add to a losing position.', { trail_stop: pivotData.trail_stop }, trailOk == null ? ['ohlcv'] : undefined);
  col.add('risk', 'Market aligns with trade direction', mktAligned,
    'Wait for the line of least resistance — market supportive.', { market_aligned: mktAligned }, mktAligned == null ? ['market_index'] : undefined);
  col.add('risk', 'Not over-extended past prior pivot', notExtended,
    'Avoid chasing far above prior pivot.', { prior_pivot: pivotData.prior_pivot });
  col.add('risk', 'Trail stop below recent pivot low', pivotData.trail_stop != null ? px > pivotData.trail_stop : null,
    'Raise stop to prior pivot low as trend continues.', { trail_stop: pivotData.trail_stop });

  return buildChecklistOutput({
    skill: 'livermore-pivot',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 10,
    extraKeyMetrics: {
      pivot: pivotData.pivot,
      prior_pivot: pivotData.prior_pivot,
      add_levels: pivotData.add_levels,
      trail_stop: pivotData.trail_stop,
      formulas: { relative_volume: Math.round(relVol * 100) / 100 },
    },
  });
}
