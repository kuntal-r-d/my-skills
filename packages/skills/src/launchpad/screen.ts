import * as ind from '@stock-buddy/core';
import {
  classifyWeinsteinStage,
  resampleToWeekly,
  type OhlcvBar,
} from '@stock-buddy/core';
import { buildChecklistOutput, CriterionCollector } from '../momentum-shared/criterion.js';
import { detectVcp } from '../momentum-shared/vcp.js';

const CATEGORY_WEIGHTS = {
  vcp: 0.35,
  volume: 0.25,
  stage: 0.25,
  sector: 0.15,
};

const CATEGORY_CRITERIA: Record<string, number[]> = {
  vcp: [1, 2, 3, 4],
  volume: [5, 6],
  stage: [7, 8],
  sector: [9, 10],
};

export function screen(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as OhlcvBar[]) ?? [];
  if (ohlcv.length < 60) {
    return { skill: 'launchpad', error: 'need >=60 OHLCV bars', bars_supplied: ohlcv.length };
  }

  const [, h, l, c, v] = ind.splitOhlcv(ohlcv);
  const px = c[c.length - 1]!;
  const flags: string[] = [];
  const vcp = detectVcp(h, l, c, v);
  const weekly = resampleToWeekly(ohlcv);
  const stage = weekly.length >= 35 ? classifyWeinsteinStage(weekly) : null;

  const s50 = ind.lastValid(ind.sma(c, 50));
  const s150 = ind.lastValid(ind.sma(c, 150));
  const s200 = ind.lastValid(ind.sma(c, 200));
  const stage2Template =
    s50 != null && s150 != null && s200 != null
      ? px > s50 && px > s150 && px > s200 && s50 > s150 && s150 > s200
      : null;

  const fundamentals = (data.fundamentals as Record<string, unknown>) ?? {};
  const sector = fundamentals.sector as string | undefined;
  const mkt = (data.market_index as OhlcvBar[]) ?? [];
  let sectorLaunchpad: boolean | null = null;
  if (sector && mkt.length >= 63 && ohlcv.length >= 63) {
    const stockRoc = ((c[c.length - 1]! - c[c.length - 63]!) / c[c.length - 63]!) * 100;
    const mc = mkt.map((b) => Number(b.close));
    const mktRoc = mc[mc.length - 63]!
      ? ((mc[mc.length - 1]! - mc[mc.length - 63]!) / mc[mc.length - 63]!) * 100
      : 0;
    const earlyStage = stage?.stage === 1 || stage?.stage === 2;
    sectorLaunchpad = stockRoc > mktRoc * 0.8 && earlyStage === true;
  } else if (!sector) {
    flags.push('missing:sector');
  }

  const col = new CriterionCollector();

  col.add(
    'vcp',
    'Progressive VCP contractions',
    vcp?.progressive ?? null,
    'Each pullback must be smaller than the prior — volatility coiling.',
    { segments: vcp?.segments.map((s) => s.range_pct) },
    vcp == null ? ['ohlcv'] : undefined,
  );
  col.add(
    'vcp',
    'Final contraction is tightest',
    vcp?.final_tightest ?? null,
    'Launchpad: the last contraction is the narrowest (often 3–8%).',
    { final_range_pct: vcp?.final_range_pct },
    vcp == null ? ['ohlcv'] : undefined,
  );
  col.add(
    'vcp',
    'Pivot level identified',
    vcp != null && vcp.pivot > 0,
    'Pivot = high of the final tight contraction — entry trigger above it.',
    { pivot: vcp?.pivot, distance_pct: vcp?.distance_to_pivot_pct },
    vcp == null ? ['ohlcv'] : undefined,
  );
  col.add(
    'vcp',
    'Near pivot (within 8% below)',
    vcp?.distance_to_pivot_pct != null ? vcp.distance_to_pivot_pct <= 8 : null,
    'Ideal Launchpad holds just below the pivot, ready to break.',
    { distance_to_pivot_pct: vcp?.distance_to_pivot_pct },
    vcp == null ? ['ohlcv'] : undefined,
  );

  col.add(
    'volume',
    'Volume dry-up on pullbacks',
    vcp?.volume_dry_up ?? null,
    'Selling pressure exhausts as volume dries up in contractions.',
    { volume_dry_up: vcp?.volume_dry_up },
    vcp == null ? ['ohlcv'] : undefined,
  );
  col.add(
    'volume',
    'Breakout volume surge (if breaking)',
    vcp?.breakout_volume_surge ?? null,
    'Breakout needs 40%+ above average volume for institutional confirmation.',
    { breakout_volume_surge: vcp?.breakout_volume_surge },
    vcp == null ? ['ohlcv'] : undefined,
  );

  col.add(
    'stage',
    'Weekly Stage 2 (Weinstein)',
    stage?.stage === 2,
    'Launchpad setups form inside a Stage 2 advancing phase.',
    { weekly_stage: stage?.stage },
    stage == null ? ['ohlcv_weekly'] : undefined,
  );
  col.add(
    'stage',
    'Daily trend template aligned',
    stage2Template,
    'Minervini trend template: price above rising 50/150/200 MAs.',
    { stage2_template: stage2Template },
    stage2Template == null ? ['ohlcv'] : undefined,
  );

  col.add(
    'sector',
    'Sector-relative strength emerging',
    sectorLaunchpad,
    'Sector Launchpad: stock gaining vs market in an early-stage base.',
    { sector, sector_launchpad: sectorLaunchpad },
    sectorLaunchpad == null && !sector ? ['sector'] : undefined,
  );
  col.add(
    'sector',
    'Not extended >15% above 50-day MA',
    s50 != null ? ((px - s50) / s50) * 100 <= 15 : null,
    'Avoid chasing extended leaders — Launchpad is pre-breakout.',
    { pct_above_ma50: s50 != null ? Math.round(((px - s50) / s50) * 1000) / 10 : null },
    s50 == null ? ['ohlcv'] : undefined,
  );

  const ready = Boolean(
    vcp?.launchpad_ready && stage?.stage === 2 && stage2Template === true,
  );

  return buildChecklistOutput({
    skill: 'launchpad',
    data,
    criteria: col.criteria,
    categoryWeights: CATEGORY_WEIGHTS,
    categoryCriteria: CATEGORY_CRITERIA,
    flags,
    totalCriteria: 10,
    extraKeyMetrics: {
      launchpad_ready: ready,
      technical_score: vcp?.launchpad_ready ? 1 : 0,
      sector_score: sectorLaunchpad ? 1 : 0,
      pivot: vcp?.pivot ?? null,
      vcp_segments: vcp?.segments.map((s) => `${s.range_pct}%`).join(' → ') ?? null,
      weekly_stage: stage?.stage ?? null,
    },
  });
}
