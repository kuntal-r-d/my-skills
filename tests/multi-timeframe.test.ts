import { describe, expect, it } from 'vitest';
import {
  analyzeMultiTimeframe,
  classifyWeinsteinStage,
  computeMultiTimeframeConfluence,
  resampleToMonthly,
  resampleToWeekly,
  type OhlcvBar,
} from '../packages/core/src/timeframes.js';
import { screen as stageScreen } from '../packages/skills/src/stage-analysis/screen.js';
import { screen as dowScreen } from '../packages/skills/src/dow-theory/screen.js';
import { screen as launchpadScreen } from '../packages/skills/src/launchpad/screen.js';
import { analyze as mtfAnalyze } from '../packages/skills/src/multi-timeframe/analyze.js';
import { detectVcp } from '../packages/skills/src/momentum-shared/vcp.js';
import { buildMomentumTrading } from '../packages/ingest/src/momentum-trading.js';

function makeBars(closes: number[], volume = 1_000_000): OhlcvBar[] {
  const start = new Date('2022-01-03T12:00:00Z');
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume,
    };
  });
}

function trendingCloses(n: number, start = 100, end = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(start + ((end - start) * i) / Math.max(n - 1, 1));
  }
  return out;
}

describe('timeframes resampling', () => {
  it('resamples daily to weekly and monthly', () => {
    const daily = makeBars(trendingCloses(300));
    const weekly = resampleToWeekly(daily);
    const monthly = resampleToMonthly(daily);
    expect(weekly.length).toBeGreaterThan(40);
    expect(monthly.length).toBeGreaterThan(8);
  });
});

describe('Weinstein stage', () => {
  it('classifies uptrend as stage 2 or rising', () => {
    const weekly = resampleToWeekly(makeBars(trendingCloses(600, 80, 220)));
    const ws = classifyWeinsteinStage(weekly);
    expect([1, 2]).toContain(ws.stage);
    expect(ws.ma30_slope).toBe('rising');
    expect(ws.price_vs_ma30).toBe('above');
  });
});

describe('multi-timeframe confluence', () => {
  it('flags conflict when daily up vs monthly bearish', () => {
    const daily: import('../packages/core/src/timeframes.js').TimeframeRead = {
      trend: 'up',
      stage: 2,
      ma_slope: 'rising',
      structure: 'HH_HL',
      adx: 28,
      extension_pct: 5,
      ma_stack: '50>150>200',
    };
    const weekly = { ...daily };
    const monthly: typeof daily = {
      trend: 'down',
      stage: 4,
      ma_slope: 'falling',
      structure: 'LH_LL',
      adx: 22,
      extension_pct: null,
      ma_stack: '50<150<200',
    };
    const { conflicts } = computeMultiTimeframeConfluence(daily, weekly, monthly);
    expect(conflicts).toContain('daily_uptrend_vs_monthly_bearish');
  });
});

describe('stage-analysis skill', () => {
  it('returns criteria on trending data', () => {
    const payload = {
      ticker: 'TEST',
      ohlcv: makeBars(trendingCloses(600, 80, 220)),
    };
    const result = stageScreen(payload);
    expect(result.error).toBeUndefined();
    expect((result.criteria as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('dow-theory skill', () => {
  it('evaluates with market indices', () => {
    const payload = {
      ticker: 'TEST',
      ohlcv: makeBars(trendingCloses(260, 100, 150)),
      market_index: makeBars(trendingCloses(260, 5000, 5500)),
      market_index_secondary: makeBars(trendingCloses(260, 3000, 3300)),
    };
    const result = dowScreen(payload);
    expect(result.error).toBeUndefined();
    expect(result.key_metrics).toBeDefined();
  });
});

describe('launchpad vcp', () => {
  it('detects progressive contractions on synthetic series', () => {
    const base = trendingCloses(80, 100, 130);
    const flat = [...Array(15).fill(128), ...Array(12).fill(129), ...Array(10).fill(130)];
    const closes = [...base, ...flat];
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const vols = closes.map(() => 1_000_000);
    const vcp = detectVcp(highs, lows, closes, vols);
    expect(vcp).not.toBeNull();
  });
});

describe('multi-timeframe skill', () => {
  it('returns confluence block', () => {
    const result = mtfAnalyze({ ohlcv: makeBars(trendingCloses(300)) });
    expect(result.error).toBeUndefined();
    expect(result.confluence_score).toBeDefined();
    expect(result.daily).toBeDefined();
  });
});

describe('buildMomentumTrading integration', () => {
  it('includes market_structure and multi_timeframe', async () => {
    const payload = {
      ticker: 'TEST',
      ohlcv: makeBars(trendingCloses(600, 80, 200)),
      fundamentals: { eps_history: [1, 1.2, 1.5, 1.9], roe: 18, sector: 'Banking' },
      market_index: makeBars(trendingCloses(600, 5000, 5600)),
      market_index_secondary: makeBars(trendingCloses(600, 3000, 3300)),
    };
    const mt = await buildMomentumTrading(payload);
    expect(mt.market_structure).toBeDefined();
    expect(mt.multi_timeframe).toBeDefined();
    expect((mt.strategies as object).minervini_sepa).toBeDefined();
  });
});
