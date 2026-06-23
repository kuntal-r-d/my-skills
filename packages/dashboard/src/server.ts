import express, { type Request, type Response, type NextFunction } from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desc, eq, sql } from 'drizzle-orm';
import {
  getDb,
  closeDb,
  loadEnv,
  getDefaultAccount,
  getFreshness,
  getLatestFundamentals,
  getLatestMacro,
  getNews,
  getOhlcv,
  getPortfolioPositions,
  getShareholding,
  getTickerBySymbol,
  listTickers,
} from '@stock-buddy/db';
import {
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

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '../public');
const PORT = Number(process.env.STOCK_BUDDY_DASHBOARD_PORT ?? 3000);

const app = express();
app.use(express.json());

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
      },
      freshness,
      recentRuns,
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
    const ohlcv = await getOhlcv(db, ticker.id, { limit });
    const fundamentals = await getLatestFundamentals(db, ticker.id);
    const shareholding = await getShareholding(db, ticker.id, 12);
    const news = await getNews(db, ticker.id, 30);
    const freshness = await getFreshness(db, ticker.id);

    return {
      ticker,
      ohlcv: ohlcv.map((r) => ({
        date: r.tradeDate,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        source: r.source,
      })),
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
    };
  });

  if (!data) {
    res.status(404).json({ error: `Ticker not found: ${symbol}` });
    return;
  }
  res.json(data);
}));

app.get('/api/portfolio', asyncHandler(async (_req, res) => {
  const data = await withDb(async (db) => {
    const account = await getDefaultAccount(db);
    if (!account) return { account: null, positions: [], sector_allocation: [] };

    const positions = await getPortfolioPositions(db, account.id);
    const enriched = positions.map((p) => {
      const cost = p.position.qty * p.position.avgCost;
      return {
        ticker: p.symbol,
        qty: p.position.qty,
        avg_cost: p.position.avgCost,
        sector: p.position.sector ?? 'Unknown',
        cost_basis: cost,
        stop_level: p.position.stopLevel,
        target_level: p.position.targetLevel,
      };
    });

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

app.listen(PORT, () => {
  console.log(`Stock Buddy Dashboard → http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void closeDb().finally(() => process.exit(0));
  });
}
