import express, { type Request, type Response, type NextFunction } from 'express';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { desc, eq, gte, sql } from 'drizzle-orm';
import {
  getDb,
  closeDb,
  loadEnv,
  getDefaultAccount,
  setAccount,
  getFreshness,
  getLatestAnalysisSnapshot,
  getLatestFundamentals,
  getLatestMacro,
  listAnalysisSnapshots,
  listRecentAnalyses,
  getNews,
  getOhlcv,
  getPortfolioPositions,
  getShareholding,
  getTickerBySymbol,
  listTickers,
  listWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  addPortfolioFill,
  getPortfolioLots,
  updatePortfolioLot,
  deletePortfolioLot,
  countPortfolioLotsByTicker,
  copyPortfolioLots,
  splitPortfolioLot,
  movePortfolioLot,
  upsertPosition,
  removePosition,
  movePortfolioPosition,
  portfolioLots,
  portfolioPositions,
  getAnalyticsKpi,
  ensureTicker,
  roc1mPctFromOhlcv,
  extractExtendedAnalysisFields,
  extractRiskMetrics,
  type PortfolioPurpose,
  listImportantNews,
  listSkillOverrides,
  getSkillOverride,
  upsertSkillOverride,
  deleteSkillOverride,
} from '@stock-buddy/db';
import {
  analysisSnapshots,
  dataFreshness,
  fundamentalsSnapshots,
  ingestRuns,
  newsItems,
  ohlcvDaily,
  portfolioPositions,
  tickers,
  watchlistTickers,
} from '@stock-buddy/db';
import {
  runTickerAnalysis,
  screenMarket,
  buildUniverse,
  runDailyBriefing,
  buildMacroLandscape,
  buildSectorMacroDetail,
  listMacroInsights,
  buildTickerContract,
  stripMeta,
  enrichRiskInAnalysis,
  enrichMomentumInAnalysis,
  enrichValueChecklistInAnalysis,
  type AnalysisMode,
} from '@stock-buddy/ingest';
import {
  sanitizeOhlcv,
  countSuspiciousOhlcvBars,
  getMergedSkill,
  listMergedSkills,
  listSkillSlugsFromDisk,
  parseSkillMd,
  validateSkillSlug,
  writeSkillToDisk,
  SKILL_TOOL_NAMES,
} from '@stock-buddy/core';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
const PORT = Number(process.env.STOCK_BUDDY_DASHBOARD_PORT ?? 3000);

const app = express();
app.use(express.json());

const discoverCache = new Map<string, { at: number; data: Record<string, unknown> }>();
const DISCOVER_TTL_MS = 60 * 60 * 1000;

function canDashboardWriteSkillsDisk(): boolean {
  return process.env.STOCK_BUDDY_SKILLS_WRITE_DISK !== '0';
}

function formatSkillApiRow(
  detail: NonNullable<ReturnType<typeof getMergedSkill>>,
  overrideRow?: Awaited<ReturnType<typeof getSkillOverride>> | null,
) {
  return {
    slug: detail.slug,
    tool_name: detail.tool_name,
    name: detail.name,
    description: detail.description,
    source: detail.source,
    has_disk: detail.has_disk,
    has_override: detail.has_override,
    is_active: detail.is_active,
    version: detail.version,
    updated_at: detail.updated_at,
    skill_md_length: detail.skill_md_length,
    skill_md: detail.skill_md,
    disk_skill_md: detail.disk_skill_md,
    override_id: detail.override_id ?? overrideRow?.id ?? null,
  };
}

function gradeToFundamentalScore(grade: string | undefined, gpa: number | undefined): number | null {
  if (gpa != null && !Number.isNaN(gpa)) return Math.round((gpa / 4) * 100);
  const map: Record<string, number> = {
    'A+': 95, A: 90, 'A-': 85, 'B+': 80, B: 75, 'B-': 70,
    'C+': 65, C: 60, 'C-': 55, D: 45, F: 30,
  };
  return grade ? (map[String(grade).trim()] ?? null) : null;
}

async function fetchTickerMarketExtras(db: ReturnType<typeof getDb>) {
  const priceRows = (await db.execute(sql`
    WITH ranked AS (
      SELECT ticker_id, close, trade_date,
        ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY trade_date DESC) AS rn
      FROM ohlcv_daily
    )
    SELECT r1.ticker_id AS ticker_id, r1.close AS last_close, r2.close AS prev_close
    FROM ranked r1
    LEFT JOIN ranked r2 ON r1.ticker_id = r2.ticker_id AND r2.rn = 2
    WHERE r1.rn = 1
  `)) as unknown as { ticker_id: number; last_close: number; prev_close: number | null }[];
  const priceMap = new Map<number, { last_close: number; chg_pct: number | null }>();
  for (const row of priceRows) {
    const chg = row.prev_close && row.last_close
      ? ((row.last_close - row.prev_close) / row.prev_close) * 100
      : null;
    priceMap.set(row.ticker_id, { last_close: row.last_close, chg_pct: chg });
  }

  const fundRows = await db
    .select({
      tickerId: fundamentalsSnapshots.tickerId,
      payload: fundamentalsSnapshots.payload,
      asOf: fundamentalsSnapshots.asOf,
    })
    .from(fundamentalsSnapshots)
    .orderBy(desc(fundamentalsSnapshots.asOf));
  const fundMap = new Map<number, Record<string, unknown>>();
  for (const f of fundRows) {
    if (!fundMap.has(f.tickerId)) fundMap.set(f.tickerId, f.payload);
  }

  const analysisRows = (await db.execute(sql`
    WITH latest AS (
      SELECT ticker_id, MAX(created_at) AS max_created
      FROM analysis_snapshots
      WHERE skill = 'analyze_ticker'
      GROUP BY ticker_id
    )
    SELECT a.ticker_id,
      (a.payload->'synthesis'->'investment'->>'composite_1_10')::float AS investment_score,
      a.payload->'synthesis'->'investment'->>'rating' AS investment_rating,
      (a.payload->'synthesis'->'momentum'->>'composite_1_10')::float AS momentum_score,
      a.payload->'synthesis'->'momentum'->>'rating' AS momentum_rating,
      a.payload->'value_investment_checklist'->>'rating' AS value_grade,
      (a.payload->'value_investment_checklist'->'key_metrics'->>'gpa')::float AS gpa,
      COALESCE(
        a.payload->'momentum_trading'->'summary'->>'rating',
        a.payload->'momentum_trading'->'summary'->>'consensus_grade',
        a.payload->'momentum_screen'->>'rating'
      ) AS momentum_grade,
      COALESCE(
        a.payload->'momentum_trading'->'summary'->>'overall_count',
        a.payload->'momentum_screen'->'key_metrics'->>'overall_count'
      ) AS momentum_count
    FROM analysis_snapshots a
    INNER JOIN latest l ON a.ticker_id = l.ticker_id AND a.created_at = l.max_created
  `)) as unknown as {
    ticker_id: number;
    investment_score: number | null;
    investment_rating: string | null;
    momentum_score: number | null;
    momentum_rating: string | null;
    value_grade: string | null;
    gpa: number | null;
    momentum_grade: string | null;
    momentum_count: string | null;
  }[];
  const analysisMap = new Map<number, {
    investment_score?: number;
    investment_rating?: string;
    momentum_score?: number;
    momentum_rating?: string;
    value_grade?: string;
    gpa?: number;
    momentum_grade?: string;
    momentum_count?: string;
  }>();
  for (const row of analysisRows) {
    analysisMap.set(row.ticker_id, {
      investment_score: row.investment_score ?? undefined,
      investment_rating: row.investment_rating ?? undefined,
      momentum_score: row.momentum_score ?? undefined,
      momentum_rating: row.momentum_rating ?? undefined,
      value_grade: row.value_grade ?? undefined,
      gpa: row.gpa ?? undefined,
      momentum_grade: row.momentum_grade ?? undefined,
      momentum_count: row.momentum_count ?? undefined,
    });
  }

  return { priceMap, fundMap, analysisMap };
}

async function withDb<T>(fn: (db: ReturnType<typeof getDb>) => Promise<T>): Promise<T> {
  return fn(getDb());
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function serializePortfolioAccount(account: NonNullable<Awaited<ReturnType<typeof getDefaultAccount>>>) {
  return {
    label: account.label,
    capital_bdt: account.capitalBdt,
    risk_per_trade_pct: account.riskPerTradePct,
    loan_balance_bdt: account.loanBalanceBdt ?? null,
    purchasing_power_bdt: account.purchasingPowerBdt ?? null,
  };
}

function computeBookMetrics(positions: { cost_basis?: number; market_value?: number | null; pnl?: number | null }[]) {
  const total_cost_basis = positions.reduce((s, p) => s + (p.cost_basis ?? 0), 0);
  const total_market_value = positions.reduce((s, p) => s + (p.market_value ?? 0), 0);
  const unrealized_gain = total_market_value - total_cost_basis;
  const unrealized_gain_pct = total_cost_basis > 0 ? (unrealized_gain / total_cost_basis) * 100 : null;
  return { total_cost_basis, total_market_value, unrealized_gain, unrealized_gain_pct };
}

async function fetchPortfolio(db: ReturnType<typeof getDb>, purpose: PortfolioPurpose) {
  const account = await getDefaultAccount(db);
  if (!account) {
    return { account: null, positions: [], sector_allocation: [], total_cost_basis: 0 };
  }

  const positions = await getPortfolioPositions(db, account.id, purpose);
  const rows = positions;
  const lotCounts = await countPortfolioLotsByTicker(db, account.id, purpose);

  const enriched = await Promise.all(
    rows.map(async (p) => {
      const cost = p.position.qty * p.position.avgCost;
      const ohlcv = await getOhlcv(db, p.position.tickerId, { limit: 23 });
      const lastClose = ohlcv[ohlcv.length - 1]?.close;
      const roc1m = roc1mPctFromOhlcv(ohlcv);
      const snap = await getLatestAnalysisSnapshot(db, p.position.tickerId);
      const payload = snap?.payload as Record<string, unknown> | undefined;
      const fields = extractExtendedAnalysisFields(payload);
      const risk = extractRiskMetrics(payload);
      const riskForTable = purpose === 'trading' || Object.keys(risk).length > 0 ? risk : undefined;
      const marketValue = lastClose != null ? p.position.qty * lastClose : null;
      const pnl = marketValue != null ? marketValue - cost : null;
      const pnlPct = pnl != null && cost ? (pnl / cost) * 100 : null;
      return {
        ticker: p.symbol,
        purpose: p.position.purpose,
        qty: p.position.qty,
        avg_cost: p.position.avgCost,
        sector: p.position.sector ?? 'Unknown',
        cost_basis: cost,
        stop_level: p.position.stopLevel ?? null,
        target_level: p.position.targetLevel ?? null,
        last_close: lastClose,
        roc_1m_pct: roc1m,
        market_value: marketValue,
        pnl,
        pnl_pct: pnlPct,
        fill_count: lotCounts.get(p.position.tickerId) ?? 0,
        fills_purpose: purpose,
        risk: riskForTable,
        ...fields,
      };
    }),
  );

  const totalCost = enriched.reduce((s, p) => s + p.cost_basis, 0);
  const sectorMap = new Map<string, number>();
  for (const p of enriched) {
    const sec = p.sector ?? 'Unknown';
    sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + p.cost_basis);
  }
  const sector_allocation = [...sectorMap.entries()]
    .map(([sector, value]) => ({
      sector,
      value,
      pct: totalCost > 0 ? (value / totalCost) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    purpose,
    account: account ? serializePortfolioAccount(account) : null,
    positions: enriched,
    total_cost_basis: totalCost,
    sector_allocation,
    book_metrics: computeBookMetrics(enriched),
  };
}

app.get('/api/stats', asyncHandler(async (_req, res) => {
  const counts = await withDb(async (db) => {
    const [tickerRow] = await db.select({ n: sql<number>`count(*)::int` }).from(tickers);
    const [ohlcvRow] = await db.select({ n: sql<number>`count(*)::int` }).from(ohlcvDaily);
    const [fundRow] = await db.select({ n: sql<number>`count(*)::int` }).from(fundamentalsSnapshots);
    const [analysisRow] = await db.select({ n: sql<number>`count(*)::int` }).from(analysisSnapshots);
    const [posRow] = await db.select({ n: sql<number>`count(*)::int` }).from(portfolioPositions);
    const [watchRow] = await db.select({ n: sql<number>`count(*)::int` }).from(watchlistTickers);
    return {
      tickers: tickerRow?.n ?? 0,
      ohlcv_bars: ohlcvRow?.n ?? 0,
      fundamentals: fundRow?.n ?? 0,
      analysis_snapshots: analysisRow?.n ?? 0,
      portfolio_positions: posRow?.n ?? 0,
      watchlist: watchRow?.n ?? 0,
    };
  });
  res.json({ counts });
}));

app.get('/api/overview', asyncHandler(async (_req, res) => {
  const data = await withDb(async (db) => {
    const [briefing, importantNews] = await Promise.all([
      runDailyBriefing(db),
      listImportantNews(db, 12, 14),
    ]);
    return { briefing, importantNews };
  });
  res.json(data);
}));

app.get('/api/tickers', asyncHandler(async (_req, res) => {
  const rows = await withDb(async (db) => {
    const all = await listTickers(db);
    const stats = await db
      .select({
        tickerId: ohlcvDaily.tickerId,
        bars: sql<number>`count(*)::int`,
        lastDate: sql<string>`max(${ohlcvDaily.tradeDate})`,
      })
      .from(ohlcvDaily)
      .groupBy(ohlcvDaily.tickerId);

    const statMap = new Map(stats.map((s) => [s.tickerId, s]));
    const { priceMap, fundMap, analysisMap } = await fetchTickerMarketExtras(db);

    return all.map((t) => {
      const price = priceMap.get(t.id);
      const fund = fundMap.get(t.id) ?? {};
      const analysis = analysisMap.get(t.id);
      const eps = (fund.eps_ttm ?? fund.eps) as number | undefined;
      const pe = fund.pe_ratio ?? fund.pe;
      let divYield = fund.dividend_yield as number | undefined;
      if (divYield != null && divYield <= 1) divYield *= 100;
      const grade = analysis?.value_grade;
      const score = gradeToFundamentalScore(grade, analysis?.gpa);
      return {
        ...t,
        ohlcv_bars: statMap.get(t.id)?.bars ?? 0,
        last_trade_date: statMap.get(t.id)?.lastDate ?? null,
        last_close: price?.last_close ?? null,
        chg_pct: price?.chg_pct ?? null,
        eps: eps ?? null,
        pe_ratio: pe ?? null,
        dividend_yield: divYield ?? null,
        investment_score: analysis?.investment_score ?? null,
        investment_rating: analysis?.investment_rating ?? null,
        momentum_score: analysis?.momentum_score ?? null,
        momentum_rating: analysis?.momentum_rating ?? null,
        momentum_grade: analysis?.momentum_grade ?? null,
        momentum_count: analysis?.momentum_count ?? null,
        value_grade: grade ?? null,
        gpa: analysis?.gpa ?? null,
        score,
      };
    });
  });
  res.json({ tickers: rows });
}));

app.get('/api/rankings', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  const data = await withDb(async (db) => {
    const all = await listTickers(db);
    const { priceMap, analysisMap } = await fetchTickerMarketExtras(db);
    const rankings = all
      .map((t) => {
        const analysis = analysisMap.get(t.id);
        const grade = analysis?.value_grade;
        const score = gradeToFundamentalScore(grade, analysis?.gpa);
        const price = priceMap.get(t.id);
        return {
          symbol: t.symbol,
          name: t.name,
          sector: t.sector,
          score,
          grade,
          investment_score: analysis?.investment_score ?? null,
          last_close: price?.last_close ?? null,
          chg_pct: price?.chg_pct ?? null,
        };
      })
      .filter((r) => r.score != null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
    return { rankings, count: rankings.length };
  });
  res.json(data);
}));

app.get('/api/market/top20', asyncHandler(async (_req, res) => {
  const data = await withDb(async (db) => {
    const all = await listTickers(db);
    const rows: {
      symbol: string;
      last_close: number;
      chg_7d: number;
      chg_7d_vs_market: number;
    }[] = [];

    let marketChg7d = 0;
    let marketCount = 0;

    for (const t of all) {
      const ohlcv = await getOhlcv(db, t.id, { limit: 12 });
      if (ohlcv.length < 6) continue;
      const last = ohlcv[ohlcv.length - 1]?.close;
      const weekAgo = ohlcv[Math.max(0, ohlcv.length - 6)]?.close;
      if (last == null || weekAgo == null || weekAgo === 0) continue;
      const chg7d = ((last - weekAgo) / weekAgo) * 100;
      marketChg7d += chg7d;
      marketCount += 1;
      rows.push({
        symbol: t.symbol,
        last_close: last,
        chg_7d: chg7d,
        chg_7d_vs_market: 0,
      });
    }

    const avgMarket = marketCount > 0 ? marketChg7d / marketCount : 0;
    for (const r of rows) {
      r.chg_7d_vs_market = r.chg_7d - avgMarket;
    }
    rows.sort((a, b) => b.chg_7d - a.chg_7d);
    return { rows: rows.slice(0, 20), count: Math.min(20, rows.length) };
  });
  res.json(data);
}));

app.get('/api/tickers/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const data = await withDb(async (db) => {
    const ticker = await getTickerBySymbol(db, symbol);
    if (!ticker) return null;

    const limit = req.query.limit ? Number(req.query.limit) : 260;
    const ohlcvRaw = await getOhlcv(db, ticker.id, { limit });
    const mapped = ohlcvRaw.map((r) => ({
      date: r.tradeDate,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      source: r.source,
    }));
    const suspicious = countSuspiciousOhlcvBars(mapped);
    const { bars: ohlcv, dropped } = sanitizeOhlcv(mapped);
    const fundamentals = await getLatestFundamentals(db, ticker.id);
    const shareholding = await getShareholding(db, ticker.id, 12);
    const news = await getNews(db, ticker.id, 90, 50);
    const freshness = await getFreshness(db, ticker.id);

    const dataWarnings: string[] = [];
    if (!fundamentals) dataWarnings.push('fundamentals missing — run: npm run ingest -- --ticker ' + symbol + ' --job all (or npm run ingest:watchlist)');
    if (ohlcv.length < 200) dataWarnings.push(`only ${ohlcv.length} price bars (need ~260 for full momentum) — run npm run ingest:daily`);
    if (suspicious > 0 || dropped > 0) {
      dataWarnings.push(`${suspicious || dropped} corrupt price bar(s) filtered — run npm run ingest:daily or per-ticker OHLCV ingest`);
    }
    if (!news.length) dataWarnings.push('no news ingested — run: npm run ingest:daily or npm run ingest:news');
    if (!shareholding.length) dataWarnings.push('shareholding missing');

    return {
      ticker,
      ohlcv,
      fundamentals: fundamentals
        ? { as_of: fundamentals.asOf, source: fundamentals.source, payload: fundamentals.payload }
        : null,
      shareholding: shareholding.map((r) => ({
        month: r.month,
        sponsor: r.sponsor,
        govt: r.govt,
        institution: r.institution,
        foreign: r.foreign,
        public: r.public,
      })),
      news,
      freshness,
      data_warnings: dataWarnings,
    };
  });

  if (!data) {
    res.status(404).json({ error: `Ticker not found: ${symbol}` });
    return;
  }
  res.json(data);
}));

app.get('/api/tickers/:symbol/news', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const days = req.query.days ? Number(req.query.days) : 90;
  const limit = req.query.limit ? Number(req.query.limit) : 50;

  const rows = await withDb(async (db) => {
    const ticker = await getTickerBySymbol(db, symbol);
    if (!ticker) return null;
    return getNews(db, ticker.id, days, limit);
  });

  if (rows === null) {
    res.status(404).json({ error: `Ticker not found: ${symbol}` });
    return;
  }
  res.json({ symbol, news: rows });
}));

app.get('/api/analysis/recent', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 30;
  const rows = await withDb((db) => listRecentAnalyses(db, limit));
  res.json({ analyses: rows });
}));

app.get('/api/tickers/:symbol/analysis', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const history = req.query.history === '1' || req.query.history === 'true';
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const data = await withDb(async (db) => {
    const ticker = await getTickerBySymbol(db, symbol);
    if (!ticker) return null;

    if (history) {
      const snapshots = await listAnalysisSnapshots(db, ticker.id, { limit });
      return {
        ticker: { symbol: ticker.symbol, name: ticker.name },
        snapshots: snapshots.map((s) => ({
          id: s.id,
          skill: s.skill,
          as_of: s.asOf,
          created_at: s.createdAt,
          model_version: s.modelVersion,
          payload: s.payload,
        })),
      };
    }

    const latest = await getLatestAnalysisSnapshot(db, ticker.id);
    let payload = latest?.payload as Record<string, unknown> | undefined;
    if (payload) {
      const contract = await buildTickerContract(db, ticker.symbol, { includePortfolio: true });
      const contractPayload = stripMeta(contract);
      payload = await enrichMomentumInAnalysis(payload, contractPayload);
      payload = enrichRiskInAnalysis(payload, contractPayload);
      payload = enrichValueChecklistInAnalysis(payload, contractPayload);
    }
    return {
      ticker: { symbol: ticker.symbol, name: ticker.name },
      snapshot: latest
        ? {
            id: latest.id,
            skill: latest.skill,
            as_of: latest.asOf,
            created_at: latest.createdAt,
            model_version: latest.modelVersion,
            payload,
          }
        : null,
    };
  });

  if (!data) {
    res.status(404).json({ error: `Ticker not found: ${symbol}` });
    return;
  }
  res.json(data);
}));

function riskSuggestPayload(risk: ReturnType<typeof extractRiskMetrics>) {
  const pick = (src: {
    buy_zone_low?: number;
    buy_zone_high?: number;
    stop_loss?: number;
    target?: number;
    suggested_shares?: number;
    position_value_bdt?: number;
    entry?: number;
  } | undefined) => {
    if (!src) return null;
    return {
      buy_zone_low: src.buy_zone_low ?? null,
      buy_zone_high: src.buy_zone_high ?? null,
      stop_loss: src.stop_loss ?? null,
      target: src.target ?? null,
      suggested_shares: src.suggested_shares ?? null,
      position_value_bdt: src.position_value_bdt ?? null,
      entry: src.entry ?? null,
    };
  };
  const atr = pick({
    buy_zone_low: risk.buy_zone_low,
    buy_zone_high: risk.buy_zone_high,
    stop_loss: risk.stop_loss,
    target: risk.target,
    suggested_shares: risk.suggested_shares,
    position_value_bdt: risk.position_value_bdt,
    entry: risk.entry,
  });
  const structure = pick(risk.structure);
  const hasAnalysis = Boolean(atr?.stop_loss != null || atr?.buy_zone_low != null || structure?.stop_loss != null);
  return { has_analysis: hasAnalysis, atr, structure };
}

app.get('/api/tickers/:symbol/risk-suggest', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const data = await withDb(async (db) => {
    const ticker = await getTickerBySymbol(db, symbol);
    if (!ticker) return null;

    const latest = await getLatestAnalysisSnapshot(db, ticker.id);
    let payload = latest?.payload as Record<string, unknown> | undefined;
    if (payload) {
      const contract = await buildTickerContract(db, ticker.symbol, { includePortfolio: true });
      const contractPayload = stripMeta(contract);
      payload = await enrichMomentumInAnalysis(payload, contractPayload);
      payload = enrichRiskInAnalysis(payload, contractPayload);
      payload = enrichValueChecklistInAnalysis(payload, contractPayload);
    }
    const risk = extractRiskMetrics(payload);
    return {
      symbol: ticker.symbol,
      ...riskSuggestPayload(risk),
    };
  });

  if (!data) {
    res.status(404).json({ error: `Ticker not found: ${symbol}` });
    return;
  }
  res.json(data);
}));

app.post('/api/tickers/:symbol/analyze', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const clientId = typeof req.body?.client_id === 'string' ? req.body.client_id : 'dashboard';
  const mode = (['standard', 'investment', 'momentum', 'full'].includes(req.body?.mode)
    ? req.body.mode
    : 'full') as AnalysisMode;

  const result = await withDb(async (db) => {
    const ticker = await getTickerBySymbol(db, symbol);
    if (!ticker) return null;
    const analysis = await runTickerAnalysis(db, ticker.symbol, { clientId, persist: true, mode });
    return { ...analysis, resolvedSymbol: ticker.symbol };
  });

  if (!result) {
    res.status(404).json({ error: `Ticker not found: ${symbol}` });
    return;
  }
  res.json({
    symbol: result.resolvedSymbol,
    snapshot_id: result.snapshotId,
    analysis: result.analysis,
  });
}));

app.post('/api/discover', asyncHandler(async (req, res) => {
  const template = req.body?.template as string | undefined;
  const mode = req.body?.mode as string | undefined;
  const sector = req.body?.sector as string | undefined;
  const commodityType = req.body?.commodity_type as string | undefined;
  const limit = Number(req.body?.limit ?? 25);
  const cacheKey = JSON.stringify({ template, mode, sector, commodityType, limit });
  const cached = discoverCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DISCOVER_TTL_MS) {
    res.json({ ...cached.data, cached: true });
    return;
  }

  const result = await withDb(async (db) => {
    const universe = await buildUniverse(db, { sector, commodityType, limit: 200 });
    const tpl =
      template ??
      (mode === 'investment' ? 'value' : mode === 'momentum' ? 'momentum_leaders' : 'momentum_leaders');
    return screenMarket({
      universe,
      template: tpl,
      mode,
      limit,
      as_of: new Date().toISOString().slice(0, 10),
    });
  });

  discoverCache.set(cacheKey, { at: Date.now(), data: result });
  res.json({ ...result, universe_size: (result.results as unknown[])?.length ?? 0, cached: false });
}));

app.get('/api/watchlist', asyncHandler(async (req, res) => {
  const purpose = req.query.purpose as 'investment' | 'trading' | undefined;
  const watchlist = await withDb(async (db) => {
    const rows = await listWatchlist(db, purpose);
    return Promise.all(
      rows.map(async (w) => {
        const snap = await getLatestAnalysisSnapshot(db, w.tickerId);
        const payload = snap?.payload as Record<string, unknown> | undefined;
        const fields = extractExtendedAnalysisFields(payload);
        const ohlcv = await getOhlcv(db, w.tickerId, { limit: 23 });
        const lastClose = ohlcv[ohlcv.length - 1]?.close;
        return {
          ...w,
          ...fields,
          last_close: lastClose ?? null,
          roc_1m_pct: roc1mPctFromOhlcv(ohlcv),
          analysis_as_of: snap?.asOf ?? null,
        };
      }),
    );
  });
  res.json({ watchlist });
}));

app.post('/api/watchlist', asyncHandler(async (req, res) => {
  const symbol = String(req.body?.symbol ?? '').toUpperCase();
  const purpose = (req.body?.purpose === 'trading' ? 'trading' : 'investment') as 'investment' | 'trading';
  if (!symbol) {
    res.status(400).json({ error: 'symbol required' });
    return;
  }
  await withDb(async (db) => {
    const t = await ensureTicker(db, symbol);
    await addToWatchlist(db, t.id, purpose);
  });
  res.json({ ok: true, symbol, purpose });
}));

app.delete('/api/watchlist/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const purpose = req.query.purpose as 'investment' | 'trading' | undefined;
  await withDb(async (db) => {
    const t = await getTickerBySymbol(db, symbol);
    if (t) await removeFromWatchlist(db, t.id, purpose);
  });
  res.json({ ok: true });
}));

app.get('/api/briefing', asyncHandler(async (_req, res) => {
  const briefing = await withDb((db) => runDailyBriefing(db));
  res.json({ briefing });
}));

app.get('/api/analytics/kpi', asyncHandler(async (_req, res) => {
  const kpi = await withDb((db) => getAnalyticsKpi(db));
  res.json(kpi);
}));

app.get('/api/glossary', asyncHandler(async (_req, res) => {
  const glossaryPath = join(publicDir, 'glossary.json');
  const guidePath = join(publicDir, 'analysis-glossary.json');

  let metrics: Array<Record<string, unknown>> = [];
  try {
    const raw = readFileSync(glossaryPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    metrics = Array.isArray(parsed) ? parsed : ((parsed as { terms?: unknown[] }).terms ?? []) as Array<Record<string, unknown>>;
  } catch {
    metrics = [];
  }

  let guide: { sections?: Array<Record<string, unknown>>; terms?: Array<Record<string, unknown>> } = {};
  try {
    guide = JSON.parse(readFileSync(guidePath, 'utf8')) as typeof guide;
  } catch {
    guide = {};
  }

  const fundamentalIds = new Set(['roe', 'pe', 'peg', 'debt_equity', 'margin_of_safety', 'pb_ratio', 'eps_ttm', 'dividend_yield', 'market_cap']);
  const technicalIds = new Set(['adx', 'atr', 'rsi', 'macd', 'mfi']);
  const portfolioIds = new Set(['inv', 'mom', 'risk']);
  const sectionOrder = ['fundamental', 'technical', 'dashboard_overview', 'dashboard_risk', 'dashboard_tools'];

  const defaultSection = (t: Record<string, unknown>): string => {
    if (t.section) return String(t.section);
    const id = String(t.id);
    if (portfolioIds.has(id)) return 'dashboard_risk';
    if (technicalIds.has(id)) return 'technical';
    if (fundamentalIds.has(id)) return 'fundamental';
    return 'fundamental';
  };

  const metricTerms: Array<Record<string, unknown>> = metrics.map((t) => ({
    ...t,
    section: defaultSection(t),
  }));
  const byId = new Map<string, Record<string, unknown>>(
    metricTerms.map((t) => [String(t.id), t]),
  );
  for (const t of guide.terms ?? []) {
    const term = t as Record<string, unknown>;
    byId.set(String(term.id), { ...term, section: defaultSection(term) });
  }

  const sectionById = new Map((guide.sections ?? []).map((s) => [String(s.id), s]));
  const sections = sectionOrder.map((id) => sectionById.get(id)).filter(Boolean);

  res.json({
    terms: [...byId.values()],
    sections,
  });
}));

app.get('/api/sectors', asyncHandler(async (_req, res) => {
  const rows = await withDb(async (db) => {
    const all = await listTickers(db);
    const sectors = [...new Set(all.map((t) => t.sector).filter(Boolean))].sort();
    const commodities = [...new Set(all.map((t) => t.commodityType).filter(Boolean))].sort();
    return { sectors, commodities };
  });
  res.json(rows);
}));

app.post('/api/portfolio/positions', asyncHandler(async (req, res) => {
  const symbol = String(req.body?.symbol ?? '').toUpperCase();
  const qty = Number(req.body?.qty);
  const avgCost = Number(req.body?.avg_cost);
  const purpose = (req.body?.purpose === 'trading' ? 'trading' : 'investment') as PortfolioPurpose;
  if (!symbol || !qty || !avgCost) {
    res.status(400).json({ error: 'symbol, qty, avg_cost required' });
    return;
  }
  const result = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    const t = await ensureTicker(db, symbol, { sector: req.body?.sector });
    const tradeDate = req.body?.trade_date ? String(req.body.trade_date).slice(0, 10) : undefined;
    const notes = req.body?.notes ? String(req.body.notes).trim() : undefined;
    await addPortfolioFill(db, account.id, t.id, {
      qty,
      price: avgCost,
      tradeDate,
      notes,
      sector: req.body?.sector ?? t.sector ?? undefined,
      stopLevel: req.body?.stop_level != null ? Number(req.body.stop_level) : undefined,
      targetLevel: req.body?.target_level != null ? Number(req.body.target_level) : undefined,
      purpose,
    });
    const rows = await getPortfolioPositions(db, account.id, purpose);
    const row = rows.find((r) => r.symbol === symbol);
    return {
      symbol,
      added_qty: qty,
      qty: row?.position.qty ?? qty,
      avg_cost: row?.position.avgCost ?? avgCost,
    };
  });
  res.json({ ok: true, ...result });
}));

app.get('/api/portfolio/positions/:symbol/fills', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const purpose = (req.query.purpose === 'trading' ? 'trading' : 'investment') as PortfolioPurpose;
  const data = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) return null;
    const t = await getTickerBySymbol(db, symbol);
    if (!t) return null;
    const positionRows = await getPortfolioPositions(db, account.id, purpose);
    const pos = positionRows.find((r) => r.symbol === symbol);
    const lots = await getPortfolioLots(db, account.id, t.id, purpose);
    return {
      symbol,
      purpose,
      position: pos
        ? {
            qty: pos.position.qty,
            avg_cost: pos.position.avgCost,
            cost_basis: pos.position.qty * pos.position.avgCost,
          }
        : null,
      fills: lots.map((lot) => ({
        id: lot.id,
        trade_date: lot.tradeDate,
        qty: lot.qty,
        price: lot.price,
        total_cost: lot.qty * lot.price,
        notes: lot.notes,
        created_at: lot.createdAt,
      })),
    };
  });
  if (!data) {
    res.status(404).json({ error: `Position not found: ${symbol}` });
    return;
  }
  res.json(data);
}));

app.patch('/api/portfolio/fills/:id', asyncHandler(async (req, res) => {
  const lotId = Number(req.params.id);
  if (!lotId) {
    res.status(400).json({ error: 'invalid fill id' });
    return;
  }
  const qty = req.body?.qty != null ? Number(req.body.qty) : undefined;
  const price = req.body?.price != null ? Number(req.body.price) : undefined;
  const tradeDate = req.body?.trade_date != null ? String(req.body.trade_date).slice(0, 10) : undefined;
  const notes = req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes).trim() : null) : undefined;
  if (qty != null && (!qty || qty <= 0)) {
    res.status(400).json({ error: 'qty must be positive' });
    return;
  }
  if (price != null && (!price || price <= 0)) {
    res.status(400).json({ error: 'price must be positive' });
    return;
  }

  const result = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    const updated = await updatePortfolioLot(db, account.id, lotId, { qty, price, tradeDate, notes });
    if (!updated) return null;
    const t = await db.select().from(tickers).where(eq(tickers.id, updated.tickerId)).limit(1);
    return {
      symbol: t[0]?.symbol,
      purpose: updated.purpose,
      position: updated.position,
      fill: {
        id: updated.lot.id,
        trade_date: updated.lot.tradeDate,
        qty: updated.lot.qty,
        price: updated.lot.price,
        total_cost: updated.lot.qty * updated.lot.price,
        notes: updated.lot.notes,
      },
    };
  });

  if (!result) {
    res.status(404).json({ error: 'Fill not found' });
    return;
  }
  res.json({ ok: true, ...result });
}));

app.delete('/api/portfolio/fills/:id', asyncHandler(async (req, res) => {
  const lotId = Number(req.params.id);
  if (!lotId) {
    res.status(400).json({ error: 'invalid fill id' });
    return;
  }

  const result = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    const deleted = await deletePortfolioLot(db, account.id, lotId);
    if (!deleted) return null;
    const t = await db.select().from(tickers).where(eq(tickers.id, deleted.tickerId)).limit(1);
    return {
      symbol: t[0]?.symbol,
      purpose: deleted.purpose,
      position: deleted.position,
    };
  });

  if (!result) {
    res.status(404).json({ error: 'Fill not found' });
    return;
  }
  res.json({ ok: true, ...result });
}));

app.delete('/api/portfolio/positions/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const purpose = (req.query.purpose === 'trading' ? 'trading' : 'investment') as PortfolioPurpose;
  await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    const t = await getTickerBySymbol(db, symbol);
    if (account && t) await removePosition(db, account.id, t.id, purpose);
  });
  res.json({ ok: true });
}));

app.post('/api/portfolio/sync-trading', asyncHandler(async (_req, res) => {
  const copied = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) return 0;
    const investment = await getPortfolioPositions(db, account.id, 'investment');
    let n = 0;
    for (const { position } of investment) {
      const invLots = await getPortfolioLots(db, account.id, position.tickerId, 'investment');
      if (!invLots.length && position.qty > 0) {
        await db.insert(portfolioLots).values({
          accountId: account.id,
          tickerId: position.tickerId,
          purpose: 'investment',
          tradeDate: new Date().toISOString().slice(0, 10),
          qty: position.qty,
          price: position.avgCost,
          notes: 'Backfill from position (pre-lots)',
        });
      }
      await copyPortfolioLots(db, account.id, position.tickerId, 'investment', 'trading');
      const tradingRows = await getPortfolioPositions(db, account.id, 'trading');
      const trading = tradingRows.find((r) => r.position.tickerId === position.tickerId);
      if (trading) {
        await db
          .update(portfolioPositions)
          .set({
            sector: trading.position.sector ?? position.sector ?? null,
            stopLevel: trading.position.stopLevel ?? position.stopLevel ?? null,
            targetLevel: trading.position.targetLevel ?? position.targetLevel ?? null,
            updatedAt: new Date(),
          })
          .where(eq(portfolioPositions.id, trading.position.id));
      }
      n += 1;
    }
    return n;
  });
  res.json({ ok: true, copied });
}));

app.post('/api/portfolio/fills/:id/split', asyncHandler(async (req, res) => {
  const lotId = Number(req.params.id);
  const splitQty = Number(req.body?.split_qty);
  const splitPrice = req.body?.split_price != null ? Number(req.body.split_price) : undefined;
  if (!lotId || !splitQty || splitQty <= 0) {
    res.status(400).json({ error: 'split_qty must be a positive number' });
    return;
  }
  if (splitPrice != null && (!splitPrice || splitPrice <= 0)) {
    res.status(400).json({ error: 'split_price must be positive when provided' });
    return;
  }

  const result = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    try {
      const split = await splitPortfolioLot(db, account.id, lotId, splitQty, splitPrice);
      if (!split) return null;
      const t = await db.select().from(tickers).where(eq(tickers.id, split.tickerId)).limit(1);
      return {
        symbol: t[0]?.symbol,
        purpose: split.purpose,
        position: split.position,
        split_qty: splitQty,
        split_price: split.lot.price,
        remain_qty: split.remain_qty,
        remain_price: split.remain_price,
        remain_lot_id: lotId,
        fill: {
          id: split.lot.id,
          trade_date: split.lot.tradeDate,
          qty: split.lot.qty,
          price: split.lot.price,
          total_cost: split.lot.qty * split.lot.price,
          notes: split.lot.notes,
        },
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'split failed' };
    }
  });

  if (!result) {
    res.status(404).json({ error: 'Fill not found' });
    return;
  }
  if ('error' in result && result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, ...result });
}));

app.post('/api/portfolio/fills/:id/move', asyncHandler(async (req, res) => {
  const lotId = Number(req.params.id);
  const to = req.body?.to === 'trading' ? 'trading' : req.body?.to === 'investment' ? 'investment' : null;
  if (!lotId || !to) {
    res.status(400).json({ error: 'to must be investment or trading' });
    return;
  }

  const result = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    try {
      const moved = await movePortfolioLot(db, account.id, lotId, to);
      if (!moved) return null;
      const t = await db.select().from(tickers).where(eq(tickers.id, moved.ticker_id)).limit(1);
      return { ...moved, symbol: t[0]?.symbol };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'move failed' };
    }
  });

  if (!result) {
    res.status(404).json({ error: 'Fill not found' });
    return;
  }
  if ('error' in result && result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, ...result });
}));

app.post('/api/portfolio/move', asyncHandler(async (req, res) => {
  const symbol = String(req.body?.symbol ?? '').toUpperCase();
  const from = req.body?.from === 'trading' ? 'trading' : req.body?.from === 'investment' ? 'investment' : null;
  const to = req.body?.to === 'trading' ? 'trading' : req.body?.to === 'investment' ? 'investment' : null;
  const qty = req.body?.qty != null ? Number(req.body.qty) : undefined;
  if (!symbol || !from || !to || from === to) {
    res.status(400).json({ error: 'symbol, from, and to required (from !== to)' });
    return;
  }
  if (qty != null && (!qty || qty <= 0)) {
    res.status(400).json({ error: 'qty must be positive when provided' });
    return;
  }

  const result = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    const t = await getTickerBySymbol(db, symbol);
    if (!t) return { status: 404 as const };

    try {
      const moved = await movePortfolioPosition(db, account.id, t.id, from, to, { qty });
      if (!moved) return { status: 404 as const, message: `No ${from} position for ${symbol}` };
      return { status: 200 as const, symbol, from, to, ...moved };
    } catch (e) {
      return { status: 400 as const, message: e instanceof Error ? e.message : 'move failed' };
    }
  });

  if (result.status === 404) {
    res.status(404).json({ error: result.message ?? `Position not found: ${symbol}` });
    return;
  }
  if (result.status === 400) {
    res.status(400).json({ error: result.message ?? 'move failed' });
    return;
  }
  res.json({
    ok: true,
    symbol: result.symbol,
    from: result.from,
    to: result.to,
    moved_qty: result.moved_qty,
    from_qty: result.from_qty,
    to_qty: result.to_qty,
    partial: result.partial,
  });
}));

app.get('/api/portfolio', asyncHandler(async (req, res) => {
  const purpose = req.query.purpose as PortfolioPurpose | undefined;
  const data = await withDb(async (db) => {
    if (purpose === 'investment' || purpose === 'trading') {
      return fetchPortfolio(db, purpose);
    }
    const [investment, trading] = await Promise.all([
      fetchPortfolio(db, 'investment'),
      fetchPortfolio(db, 'trading'),
    ]);
    const account = investment.account ?? trading.account;
    const invBook = investment.book_metrics ?? computeBookMetrics(investment.positions ?? []);
    const trBook = trading.book_metrics ?? computeBookMetrics(trading.positions ?? []);
    return {
      account,
      metrics: {
        loan_balance_bdt: account?.loan_balance_bdt ?? null,
        purchasing_power_bdt: account?.purchasing_power_bdt ?? null,
        equity_bdt: account?.capital_bdt ?? null,
        investment: {
          total_cost_basis: invBook.total_cost_basis,
          total_market_value: invBook.total_market_value,
          net_gain_bdt: invBook.unrealized_gain,
          net_gain_pct: invBook.unrealized_gain_pct,
        },
        trading: {
          total_cost_basis: trBook.total_cost_basis,
          total_market_value: trBook.total_market_value,
          net_gain_bdt: trBook.unrealized_gain,
          net_gain_pct: trBook.unrealized_gain_pct,
        },
        // legacy aliases (investment book)
        total_cost_basis: invBook.total_cost_basis,
        total_market_value: invBook.total_market_value,
        net_gain_bdt: invBook.unrealized_gain,
        net_gain_pct: invBook.unrealized_gain_pct,
      },
      investment,
      trading,
    };
  });
  res.json(data);
}));

app.patch('/api/portfolio/account', asyncHandler(async (req, res) => {
  await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    await setAccount(db, account.id, {
      capitalBdt: req.body?.equity_bdt != null ? Number(req.body.equity_bdt)
        : req.body?.capital_bdt != null ? Number(req.body.capital_bdt) : undefined,
      riskPerTradePct: req.body?.risk_per_trade_pct != null ? Number(req.body.risk_per_trade_pct) : undefined,
      loanBalanceBdt: req.body?.loan_balance_bdt !== undefined
        ? (req.body.loan_balance_bdt === null || req.body.loan_balance_bdt === '' ? null : Number(req.body.loan_balance_bdt))
        : undefined,
      purchasingPowerBdt: req.body?.purchasing_power_bdt !== undefined
        ? (req.body.purchasing_power_bdt === null || req.body.purchasing_power_bdt === '' ? null : Number(req.body.purchasing_power_bdt))
        : undefined,
    });
  });
  res.json({ ok: true });
}));

app.get('/api/macro', asyncHandler(async (_req, res) => {
  const snap = await withDb((db) => getLatestMacro(db));
  res.json({
    macro: snap ? { as_of: snap.asOf, source: snap.source, payload: snap.payload } : null,
  });
}));

app.get('/api/macro/landscape', asyncHandler(async (_req, res) => {
  const landscape = await withDb((db) => buildMacroLandscape(db));
  res.json(landscape);
}));

app.get('/api/macro/sectors', asyncHandler(async (_req, res) => {
  const landscape = await withDb((db) => buildMacroLandscape(db));
  res.json({ sectors: landscape.sectors, as_of: landscape.as_of });
}));

app.get('/api/macro/sectors/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).toLowerCase();
  const detail = await withDb((db) => buildSectorMacroDetail(db, slug));
  if (!detail) {
    res.status(404).json({ error: `Unknown sector: ${slug}` });
    return;
  }
  res.json(detail);
}));

app.get('/api/macro/insights', asyncHandler(async (req, res) => {
  const scope = req.query.scope ? String(req.query.scope) : undefined;
  const sector = req.query.sector ? String(req.query.sector) : undefined;
  const insightType = req.query.insight_type ? String(req.query.insight_type) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const insights = await withDb((db) =>
    listMacroInsights(db, { scope, sector, insightType, limit }),
  );
  res.json({ insights });
}));

app.post('/api/macro/refresh-insights', asyncHandler(async (req, res) => {
  const sector = req.body?.sector ? String(req.body.sector) : undefined;
  const scope = req.body?.scope ? String(req.body.scope) : undefined;
  if (!process.env.STOCK_BUDDY_LLM_API_KEY) {
    res.status(503).json({
      error: 'LLM refresh not configured',
      hint: 'Set STOCK_BUDDY_LLM_API_KEY or use sector_macro_insights via Claude Desktop MCP',
    });
    return;
  }
  const { refreshSectorInsights } = await import('@stock-buddy/ingest');
  const result = await withDb((db) => refreshSectorInsights(db, { sector, scope }));
  res.json(result);
}));

app.get('/api/news', asyncHandler(async (req, res) => {
  const symbol = req.query.ticker ? String(req.query.ticker).toUpperCase() : undefined;
  const days = req.query.days ? Number(req.query.days) : 30;

  const rows = await withDb(async (db) => {
    let tickerId: number | undefined;
    if (symbol) {
      const t = await getTickerBySymbol(db, symbol);
      if (!t) return [];
      tickerId = t.id;
    }
    const items = await getNews(db, tickerId, days);
    if (symbol) return items;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    return db
      .select({
        id: newsItems.id,
        publishedDate: newsItems.publishedDate,
        headline: newsItems.headline,
        source: newsItems.source,
        category: newsItems.category,
        url: newsItems.url,
        symbol: tickers.symbol,
      })
      .from(newsItems)
      .leftJoin(tickers, eq(newsItems.tickerId, tickers.id))
      .where(gte(newsItems.publishedDate, cutoffStr))
      .orderBy(desc(newsItems.publishedDate))
      .limit(150);
  });

  res.json({ news: rows });
}));

app.get('/api/ingest-runs', asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const rows = await withDb(async (db) =>
    db
      .select({
        id: ingestRuns.id,
        jobName: ingestRuns.jobName,
        status: ingestRuns.status,
        rowsUpserted: ingestRuns.rowsUpserted,
        startedAt: ingestRuns.startedAt,
        finishedAt: ingestRuns.finishedAt,
        errorMessage: ingestRuns.errorMessage,
        source: ingestRuns.source,
        symbol: tickers.symbol,
      })
      .from(ingestRuns)
      .leftJoin(tickers, eq(ingestRuns.tickerId, tickers.id))
      .orderBy(desc(ingestRuns.startedAt))
      .limit(limit),
  );
  res.json({ runs: rows });
}));

app.get('/api/freshness', asyncHandler(async (_req, res) => {
  const rows = await withDb(async (db) =>
    db
      .select({
        entityType: dataFreshness.entityType,
        lastSuccessAt: dataFreshness.lastSuccessAt,
        lastAttemptAt: dataFreshness.lastAttemptAt,
        staleAfterHours: dataFreshness.staleAfterHours,
        symbol: tickers.symbol,
      })
      .from(dataFreshness)
      .leftJoin(tickers, eq(dataFreshness.tickerId, tickers.id))
      .orderBy(desc(dataFreshness.lastSuccessAt)),
  );
  res.json({ freshness: rows });
}));

app.get('/api/skills', asyncHandler(async (_req, res) => {
  const skills = await withDb(async (db) => {
    const diskSlugs = listSkillSlugsFromDisk();
    const overrides = await listSkillOverrides(db);
    return listMergedSkills(diskSlugs, overrides);
  });
  res.json({ skills, count: skills.length });
}));

app.get('/api/skills/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).trim();
  try {
    validateSkillSlug(slug);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  const data = await withDb(async (db) => {
    const override = await getSkillOverride(db, slug);
    const detail = getMergedSkill(slug, override, { include_disk_copy: true });
    if (!detail) return null;
    return formatSkillApiRow(detail, override);
  });
  if (!data) {
    res.status(404).json({ error: `Skill not found: ${slug}` });
    return;
  }
  res.json({ skill: data });
}));

app.put('/api/skills/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).trim();
  const skillMd = String(req.body?.skill_md ?? '').trim();
  if (!skillMd) {
    res.status(400).json({ error: 'skill_md required' });
    return;
  }
  try {
    validateSkillSlug(slug);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }

  const parsed = parseSkillMd(skillMd);
  const syncToDisk = req.body?.sync_to_disk === true;

  const result = await withDb(async (db) => {
    const row = await upsertSkillOverride(db, {
      slug,
      skillMd,
      toolName: SKILL_TOOL_NAMES[slug],
      name: parsed.name ?? undefined,
      description: parsed.description ?? undefined,
      clientId: typeof req.body?.client_id === 'string' ? req.body.client_id : 'dashboard',
      isActive: req.body?.is_active !== false,
    });
    let diskPath: string | undefined;
    if (syncToDisk) {
      if (!canDashboardWriteSkillsDisk()) {
        throw new Error('Disk write disabled. Set STOCK_BUDDY_SKILLS_WRITE_DISK=1');
      }
      diskPath = writeSkillToDisk(slug, skillMd).path;
    }
    const detail = getMergedSkill(slug, row, { include_disk_copy: true });
    return { row, diskPath, detail };
  });

  res.json({
    ok: true,
    slug,
    version: result.row.version,
    synced_to_disk: Boolean(result.diskPath),
    disk_path: result.diskPath,
    skill: result.detail ? formatSkillApiRow(result.detail, result.row) : undefined,
  });
}));

app.delete('/api/skills/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).trim();
  const removed = await withDb((db) => deleteSkillOverride(db, slug));
  if (!removed) {
    res.status(404).json({ error: `No DB override for skill: ${slug}` });
    return;
  }
  const detail = getMergedSkill(slug, null, { include_disk_copy: true });
  res.json({
    ok: true,
    slug,
    skill: detail ? formatSkillApiRow(detail, null) : null,
  });
}));

app.post('/api/skills/:slug/sync-disk', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).trim();
  if (!canDashboardWriteSkillsDisk()) {
    res.status(403).json({ error: 'Disk write disabled. Set STOCK_BUDDY_SKILLS_WRITE_DISK=1' });
    return;
  }
  const data = await withDb(async (db) => {
    const override = await getSkillOverride(db, slug);
    const detail = getMergedSkill(slug, override, { include_disk_copy: false });
    if (!detail) return null;
    const { path: diskPath } = writeSkillToDisk(slug, detail.skill_md);
    return { detail, diskPath, source: detail.source };
  });
  if (!data) {
    res.status(404).json({ error: `Skill not found: ${slug}` });
    return;
  }
  res.json({ ok: true, slug, disk_path: data.diskPath, source: data.source });
}));

app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(join(publicDir, 'index.html'));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`Stock Buddy Dashboard → http://localhost:${PORT}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other process or set STOCK_BUDDY_DASHBOARD_PORT, e.g.:\n`
      + `  kill $(lsof -t -i:${PORT}) 2>/dev/null\n`
      + `  STOCK_BUDDY_DASHBOARD_PORT=3001 npm run dashboard`,
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void closeDb().finally(() => process.exit(0));
  });
}
