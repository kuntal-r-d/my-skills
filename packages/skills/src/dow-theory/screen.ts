import {
  classifyDowTrend,
  computeSwingStructure,
  resampleToMonthly,
  resampleToWeekly,
  splitOhlcv,
  type OhlcvBar,
} from '@stock-buddy/core';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';

const CATEGORY_WEIGHTS = {
  primary: 0.25,
  secondary: 0.2,
  volume: 0.2,
  confirmation: 0.2,
  alignment: 0.15,
};

const CATEGORY_CRITERIA: Record<string, number[]> = {
  primary: [1, 2],
  secondary: [3, 4],
  volume: [5, 6],
  confirmation: [7, 8],
  alignment: [9, 10],
};

function indexTrend(mkt: OhlcvBar[]): { primary: ReturnType<typeof classifyDowTrend>; secondary: ReturnType<typeof classifyDowTrend> } | null {
  if (mkt.length < 30) return null;
  const weekly = resampleToWeekly(mkt);
  const monthly = resampleToMonthly(mkt);
  return {
    primary: classifyDowTrend(monthly.length >= 6 ? monthly : weekly, 'primary'),
    secondary: classifyDowTrend(weekly.length >= 20 ? weekly : mkt, 'secondary'),
  };
}

function volumeConfirmsTrend(bars: OhlcvBar[]): boolean | null {
  if (bars.length < 25) return null;
  const [, , , c, v] = splitOhlcv(bars);
  let upVol = 0;
  let downVol = 0;
  for (let i = bars.length - 20; i < bars.length; i++) {
    if (c[i]! > c[i - 1]!) upVol += v[i]!;
    else if (c[i]! < c[i - 1]!) downVol += v[i]!;
  }
  if (upVol + downVol === 0) return null;
  return upVol > downVol;
}

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as OhlcvBar[]) ?? [];
  const mkt = (data.market_index as OhlcvBar[]) ?? [];
  const mkt2 = (data.market_index_secondary as OhlcvBar[]) ?? [];
  const flags: string[] = [];

  if (!mkt.length) {
    return { skill: 'dow-theory', error: 'need market_index (DSEX)', bars_supplied: 0 };
  }

  const primaryMkt = indexTrend(mkt);
  const secondaryMkt = mkt2.length ? indexTrend(mkt2) : null;
  if (!primaryMkt) {
    return { skill: 'dow-theory', error: 'insufficient market_index history', bars_supplied: mkt.length };
  }

  const stockWeekly = ohlcv.length >= 35 ? resampleToWeekly(ohlcv) : [];
  const stockTrend = stockWeekly.length >= 20 ? classifyDowTrend(stockWeekly, 'secondary') : null;
  const stockVol = volumeConfirmsTrend(ohlcv);
  const mktVol = volumeConfirmsTrend(mkt);

  let indexPairConfirm: boolean | null = null;
  if (secondaryMkt) {
    indexPairConfirm =
      primaryMkt.primary.direction === secondaryMkt.primary.direction &&
      primaryMkt.primary.direction !== 'sideways';
  } else {
    flags.push('missing_secondary_index');
  }

  const col = new CriterionCollector();

  col.add(
    'primary',
    'DSEX primary trend up',
    primaryMkt.primary.direction === 'up',
    'Dow primary trend (monthly structure): market in bull phase.',
    { primary_trend: primaryMkt.primary.direction },
  );
  col.add(
    'primary',
    'No primary reversal signal on DSEX',
    !primaryMkt.primary.reversal_signal,
    'Trend persists until lower-high + lower-low reversal sequence.',
    { reversal_signal: primaryMkt.primary.reversal_signal },
  );

  col.add(
    'secondary',
    'DSEX secondary trend supportive',
    primaryMkt.secondary.direction === 'up' || primaryMkt.secondary.direction === 'sideways',
    'Secondary (weekly) correction within a primary uptrend is acceptable.',
    { secondary_trend: primaryMkt.secondary.direction },
  );
  col.add(
    'secondary',
    'Secondary not in confirmed decline',
    primaryMkt.secondary.direction !== 'down',
    'A declining secondary trend warns of deeper correction.',
    { secondary_trend: primaryMkt.secondary.direction },
  );

  col.add(
    'volume',
    'DSEX volume confirms uptrend',
    mktVol === true,
    'Dow tenet: volume should expand on advances, contract on pullbacks.',
    { volume_confirms: mktVol },
    mktVol == null ? ['market_index'] : undefined,
  );
  col.add(
    'volume',
    'Stock volume confirms direction',
    stockVol === true,
    'Stock-level volume should support its trend direction.',
    { stock_volume_confirms: stockVol },
    stockVol == null ? ['ohlcv'] : undefined,
  );

  col.add(
    'confirmation',
    'Index pair confirms (DSEX + secondary)',
    indexPairConfirm,
    'Dow tenet: related averages must agree for a reliable trend.',
    { index_confirmed: indexPairConfirm },
    indexPairConfirm == null ? ['market_index_secondary'] : undefined,
  );
  col.add(
    'confirmation',
    'Secondary index primary trend matches DSEX',
    secondaryMkt
      ? secondaryMkt.primary.direction === primaryMkt.primary.direction
      : null,
    'DS30/DSES should confirm DSEX direction.',
    {
      dsex: primaryMkt.primary.direction,
      secondary: secondaryMkt?.primary.direction,
    },
    secondaryMkt ? undefined : ['market_index_secondary'],
  );

  const aligned =
    stockTrend != null &&
    primaryMkt.primary.direction === 'up' &&
    stockTrend.direction === 'up';
  col.add(
    'alignment',
    'Stock trend aligns with market primary',
    stockTrend ? aligned : null,
    'Trade with the line of least resistance — stock and market same direction.',
    { stock_trend: stockTrend?.direction, market_primary: primaryMkt.primary.direction },
    stockTrend == null ? ['ohlcv'] : undefined,
  );
  col.add(
    'alignment',
    'Stock HH/HL structure',
    stockWeekly.length >= 20
      ? computeSwingStructure(
          stockWeekly.map((b) => b.high),
          stockWeekly.map((b) => b.low),
          30,
        ).pattern === 'HH_HL'
      : null,
    'Stock should show higher highs and higher lows in a bull market.',
    { structure: stockTrend?.structure },
    stockWeekly.length < 20 ? ['ohlcv'] : undefined,
  );

  return buildChecklistOutput({
    skill: 'dow-theory',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 10,
    extraKeyMetrics: {
      primary_trend: primaryMkt.primary.direction,
      secondary_trend: primaryMkt.secondary.direction,
      volume_confirms: mktVol,
      index_confirmed: indexPairConfirm,
      stock_trend: stockTrend?.direction ?? null,
      formulas: {
        dsex_structure: primaryMkt.primary.structure,
        dsex_secondary_structure: primaryMkt.secondary.structure,
      },
    },
  });
}
