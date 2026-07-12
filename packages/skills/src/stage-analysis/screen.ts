import {
  classifyWeinsteinStage,
  resampleToWeekly,
  type OhlcvBar,
} from '@stock-buddy/core';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';

const CATEGORY_WEIGHTS = {
  stage: 0.35,
  ma: 0.25,
  structure: 0.25,
  timing: 0.15,
};

const CATEGORY_CRITERIA: Record<string, number[]> = {
  stage: [1, 2],
  ma: [3, 4, 5],
  structure: [6, 7],
  timing: [8, 9],
};

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const daily = (data.ohlcv as OhlcvBar[]) ?? [];
  const weekly =
    (data.ohlcv_weekly as OhlcvBar[]) ?? (daily.length >= 35 ? resampleToWeekly(daily) : []);

  if (weekly.length < 35) {
    return {
      skill: 'stage-analysis',
      error: 'need >=35 weekly bars (~2 years daily)',
      bars_supplied: weekly.length,
    };
  }

  const ws = classifyWeinsteinStage(weekly);
  const flags: string[] = [];
  const px = weekly[weekly.length - 1]!.close;
  const col = new CriterionCollector();

  const stageLabel = `Stage ${ws.stage}`;
  col.add(
    'stage',
    `Classified as ${stageLabel}`,
    ws.stage === 2 ? true : ws.stage === 4 ? false : null,
    `Weinstein stage ${ws.stage}: ${ws.stage === 2 ? 'advancing — ideal momentum zone' : ws.stage === 4 ? 'declining — avoid longs' : 'transitional base or top'}.`,
    { stage: ws.stage, confidence: ws.confidence },
  );
  col.add(
    'stage',
    'Stage 2 advancing (buy zone)',
    ws.stage === 2,
    'Stage 2 is when institutional money drives the markup phase.',
    { stage: ws.stage },
  );

  col.add(
    'ma',
    'Price above 30-week MA',
    ws.price_vs_ma30 === 'above',
    'Leaders in Stage 2 stay above the rising 30-week average.',
    { price_vs_ma30: ws.price_vs_ma30, ma30: ws.ma30 },
    ws.ma30 == null ? ['ohlcv_weekly'] : undefined,
  );
  col.add(
    'ma',
    '30-week MA rising',
    ws.ma30_slope === 'rising',
    'A rising 30-week MA confirms the advancing stage.',
    { ma30_slope: ws.ma30_slope },
    ws.ma30_slope == null ? ['ohlcv_weekly'] : undefined,
  );
  col.add(
    'ma',
    '30-week MA not falling',
    ws.ma30_slope !== 'falling',
    'A falling 30-week MA signals Stage 4 risk.',
    { ma30_slope: ws.ma30_slope },
    ws.ma30_slope == null ? ['ohlcv_weekly'] : undefined,
  );

  col.add(
    'structure',
    'Higher highs and higher lows',
    ws.structure === 'HH_HL',
    'Stage 2 shows HH/HL price structure on the weekly chart.',
    { structure: ws.structure },
  );
  col.add(
    'structure',
    'Not in lower-highs / lower-lows decline',
    ws.structure !== 'LH_LL',
    'LH/LL structure marks Stage 4 distribution/decline.',
    { structure: ws.structure },
  );

  const distMa =
    ws.ma30 != null && ws.ma30 > 0 ? ((px - ws.ma30) / ws.ma30) * 100 : null;
  const inBuyZone = distMa != null && distMa >= 0 && distMa <= 12;
  col.add(
    'timing',
    'Pullback near 30-week MA (buy zone)',
    inBuyZone,
    'Ideal entries are on pullbacks to the rising 30-week MA, not extended chase.',
    { pct_above_ma30: distMa },
    distMa == null ? ['ohlcv_weekly'] : undefined,
  );
  col.add(
    'timing',
    'Not extended >20% above 30-week MA',
    distMa != null ? distMa <= 20 : null,
    'Extended leaders above the 30-week MA carry higher reversal risk.',
    { pct_above_ma30: distMa },
    distMa == null ? ['ohlcv_weekly'] : undefined,
  );

  if (ws.stage === 3) flags.push('stage3_topping_caution');

  return buildChecklistOutput({
    skill: 'stage-analysis',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 9,
    extraKeyMetrics: {
      stage: ws.stage,
      stage_label: stageLabel,
      ma30: ws.ma30,
      ma30_slope: ws.ma30_slope,
      confidence: ws.confidence,
      range_pct: ws.range_pct,
      structure: ws.structure,
    },
  });
}
