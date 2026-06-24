import express, { type Request, type Response, type NextFunction } from 'express';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { desc, eq, sql } from 'drizzle-orm';
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
} from '@stock-buddy/db';
import {
  analysisSnapshots,
  dataFreshness,
  fundamentalsSnapshots,
  ingestRuns,
  macroSnapshots,
  newsItems,
  ohlcvDaily,
  portfolioPositions,
  shareholdingMonthly,
  tickers,
  watchlistTickers,
} from '@stock-buddy/db';
import {
  runTickerAnalysis,
  screenMarket,
  buildUniverse,
  runDailyBriefing,
  type AnalysisMode,
} from '@stock-buddy/ingest';
import { sanitizeOhlcv, countSuspiciousOhlcvBars } from '@stock-buddy/core';

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
const PORT = Number(process.env.STOCK_BUDDY_DASHBOARD_PORT ?? 3000);

const app = express();
app.use(express.json());

const discoverCache = new Map<string, { at: number; data: Record<string, unknown> }>();
const DISCOVER_TTL_MS = 60 * 60 * 1000;

async function withDb<T>(fn: (db: ReturnType<typeof getDb>) => Promise<T>): Promise<T> {
  return fn(getDb());
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

app.get('/api/overview', asyncHandler(async (_req, res) => {
  const data = await withDb(async (db) => {
    const [tickerRow] = await db.select({ n: sql<number>`count(*)::int` }).from(tickers);
    const [ohlcvRow] = await db.select({ n: sql<number>`count(*)::int` }).from(ohlcvDaily);
    const [fundRow] = await db.select({ n: sql<number>`count(*)::int` }).from(fundamentalsSnapshots);
    const [shareRow] = await db.select({ n: sql<number>`count(*)::int` }).from(shareholdingMonthly);
    const [newsRow] = await db.select({ n: sql<number>`count(*)::int` }).from(newsItems);
    const [macroRow] = await db.select({ n: sql<number>`count(*)::int` }).from(macroSnapshots);
    const [posRow] = await db.select({ n: sql<number>`count(*)::int` }).from(portfolioPositions);
    const [runRow] = await db.select({ n: sql<number>`count(*)::int` }).from(ingestRuns);
    const [watchRow] = await db.select({ n: sql<number>`count(*)::int` }).from(watchlistTickers);
    const [analysisRow] = await db.select({ n: sql<number>`count(*)::int` }).from(analysisSnapshots);

    const recentAnalyses = await listRecentAnalyses(db, 15);

    const freshness = await db
      .select()
      .from(dataFreshness)
      .orderBy(desc(dataFreshness.lastSuccessAt))
      .limit(50);

    const recentRuns = await db
      .select({
        id: ingestRuns.id,
        jobName: ingestRuns.jobName,
        status: ingestRuns.status,
        rowsUpserted: ingestRuns.rowsUpserted,
        startedAt: ingestRuns.startedAt,
        errorMessage: ingestRuns.errorMessage,
        symbol: tickers.symbol,
      })
      .from(ingestRuns)
      .leftJoin(tickers, eq(ingestRuns.tickerId, tickers.id))
      .orderBy(desc(ingestRuns.startedAt))
      .limit(20);

    return {
      counts: {
        tickers: tickerRow?.n ?? 0,
        ohlcv_bars: ohlcvRow?.n ?? 0,
        fundamentals: fundRow?.n ?? 0,
        shareholding: shareRow?.n ?? 0,
        news: newsRow?.n ?? 0,
        macro: macroRow?.n ?? 0,
        portfolio_positions: posRow?.n ?? 0,
        ingest_runs: runRow?.n ?? 0,
        watchlist: watchRow?.n ?? 0,
        analysis_snapshots: analysisRow?.n ?? 0,
      },
      freshness,
      recentRuns,
      recentAnalyses,
    };
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
    const news = await getNews(db, ticker.id, 30);
    const freshness = await getFreshness(db, ticker.id);

    const dataWarnings: string[] = [];
    if (!fundamentals) dataWarnings.push('fundamentals missing — run: npm run ingest -- --ticker ' + symbol + ' --job all');
    if (ohlcv.length < 200) dataWarnings.push(`only ${ohlcv.length} price bars (need ~260 for full momentum)`);
    if (suspicious > 0 || dropped > 0) {
      dataWarnings.push(`${suspicious || dropped} corrupt price bar(s) filtered — re-ingest recommended`);
    }
    if (!news.length) dataWarnings.push('no news ingested');
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
    return {
      ticker: { symbol: ticker.symbol, name: ticker.name },
      snapshot: latest
        ? {
            id: latest.id,
            skill: latest.skill,
            as_of: latest.asOf,
            created_at: latest.createdAt,
            model_version: latest.modelVersion,
            payload: latest.payload,
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
  const rows = await withDb((db) => listWatchlist(db, purpose));
  res.json({ watchlist: rows });
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
  try {
    const raw = readFileSync(glossaryPath, 'utf8');
    const parsed = JSON.parse(raw);
    res.json({ terms: Array.isArray(parsed) ? parsed : parsed.terms ?? [] });
  } catch {
    res.json({ terms: [] });
  }
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
    });
  });
  res.json({ ok: true });
}));

app.delete('/api/portfolio/positions/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol).toUpperCase();
  await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    const t = await getTickerBySymbol(db, symbol);
    if (account && t) await removePosition(db, account.id, t.id);
  });
  res.json({ ok: true });
}));

app.get('/api/portfolio', asyncHandler(async (_req, res) => {
  const data = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) return { account: null, positions: [], sector_allocation: [] };

    const positions = await getPortfolioPositions(db, account.id);
    const enriched = await Promise.all(
      positions.map(async (p) => {
        const cost = p.position.qty * p.position.avgCost;
        const ohlcv = await getOhlcv(db, p.position.tickerId, { limit: 1 });
        const lastClose = ohlcv[ohlcv.length - 1]?.close;
        const snap = await getLatestAnalysisSnapshot(db, p.position.tickerId);
        const payload = snap?.payload as Record<string, unknown> | undefined;
        const syn = payload?.synthesis as Record<string, unknown> | undefined;
        const inv = syn?.investment as Record<string, unknown> | undefined;
        const mom = syn?.momentum as Record<string, unknown> | undefined;
        const marketValue = lastClose != null ? p.position.qty * lastClose : null;
        const pnl = marketValue != null ? marketValue - cost : null;
        const pnlPct = pnl != null && cost ? (pnl / cost) * 100 : null;
        return {
          ticker: p.symbol,
          qty: p.position.qty,
          avg_cost: p.position.avgCost,
          sector: p.position.sector ?? 'Unknown',
          cost_basis: cost,
          stop_level: p.position.stopLevel,
          target_level: p.position.targetLevel,
          last_close: lastClose,
          market_value: marketValue,
          pnl,
          pnl_pct: pnlPct,
          investment_score: inv?.composite_1_10,
          momentum_score: mom?.composite_1_10,
          risk_rating: (payload?.risk as Record<string, unknown> | undefined)?.rating,
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
      account: {
        label: account.label,
        capital_bdt: account.capitalBdt,
        risk_per_trade_pct: account.riskPerTradePct,
      },
      positions: enriched,
      total_cost_basis: totalCost,
      sector_allocation,
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
      .orderBy(desc(newsItems.publishedDate))
      .limit(100);
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
