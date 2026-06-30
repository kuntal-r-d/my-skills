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
  upsertPosition,
  removePosition,
  getAnalyticsKpi,
  ensureTicker,
  roc1mPctFromOhlcv,
  extractAnalysisScores,
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
  buildTickerContract,
  stripMeta,
  enrichRiskInAnalysis,
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

async function withDb<T>(fn: (db: ReturnType<typeof getDb>) => Promise<T>): Promise<T> {
  return fn(getDb());
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

async function fetchPortfolio(db: ReturnType<typeof getDb>, purpose: PortfolioPurpose) {
  const account = await getDefaultAccount(db);
  if (!account) {
    return { account: null, positions: [], sector_allocation: [], total_cost_basis: 0 };
  }

  const positions = await getPortfolioPositions(db, account.id, purpose);
  let mirroredFromInvestment = false;
  let rows = positions;
  if (purpose === 'trading' && rows.length === 0) {
    const investmentRows = await getPortfolioPositions(db, account.id, 'investment');
    if (investmentRows.length > 0) {
      rows = investmentRows;
      mirroredFromInvestment = true;
    }
  }

  const enriched = await Promise.all(
    rows.map(async (p) => {
      const cost = p.position.qty * p.position.avgCost;
      const ohlcv = await getOhlcv(db, p.position.tickerId, { limit: 23 });
      const lastClose = ohlcv[ohlcv.length - 1]?.close;
      const roc1m = roc1mPctFromOhlcv(ohlcv);
      const snap = await getLatestAnalysisSnapshot(db, p.position.tickerId);
      const payload = snap?.payload as Record<string, unknown> | undefined;
      const scores = extractAnalysisScores(payload);
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
        stop_level: p.position.stopLevel ?? riskForTable?.stop_loss,
        target_level: p.position.targetLevel ?? riskForTable?.target,
        last_close: lastClose,
        roc_1m_pct: roc1m,
        market_value: marketValue,
        pnl,
        pnl_pct: pnlPct,
        risk: riskForTable,
        ...scores,
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
    mirrored_from_investment: mirroredFromInvestment,
    account: {
      label: account.label,
      capital_bdt: account.capitalBdt,
      risk_per_trade_pct: account.riskPerTradePct,
    },
    positions: enriched,
    total_cost_basis: totalCost,
    sector_allocation,
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
    return all.map((t) => ({
      ...t,
      ohlcv_bars: statMap.get(t.id)?.bars ?? 0,
      last_trade_date: statMap.get(t.id)?.lastDate ?? null,
    }));
  });
  res.json({ tickers: rows });
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
      payload = enrichRiskInAnalysis(payload, stripMeta(contract));
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
        const scores = extractAnalysisScores(snap?.payload as Record<string, unknown> | undefined);
        return { ...w, ...scores, analysis_as_of: snap?.asOf ?? null };
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
  await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) throw new Error('No portfolio account');
    const t = await ensureTicker(db, symbol, { sector: req.body?.sector });
    await upsertPosition(db, account.id, t.id, {
      qty,
      avgCost,
      sector: req.body?.sector ?? t.sector ?? undefined,
      stopLevel: req.body?.stop_level != null ? Number(req.body.stop_level) : undefined,
      targetLevel: req.body?.target_level != null ? Number(req.body.target_level) : undefined,
      purpose,
    });
  });
  res.json({ ok: true });
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
      await upsertPosition(db, account.id, position.tickerId, {
        qty: position.qty,
        avgCost: position.avgCost,
        sector: position.sector ?? undefined,
        stopLevel: position.stopLevel ?? undefined,
        targetLevel: position.targetLevel ?? undefined,
        purpose: 'trading',
      });
      n += 1;
    }
    return n;
  });
  res.json({ ok: true, copied });
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
    return {
      account: investment.account ?? trading.account,
      investment,
      trading,
    };
  });
  res.json(data);
}));

app.get('/api/macro', asyncHandler(async (_req, res) => {
  const snap = await withDb((db) => getLatestMacro(db));
  res.json({
    macro: snap ? { as_of: snap.asOf, source: snap.source, payload: snap.payload } : null,
  });
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
