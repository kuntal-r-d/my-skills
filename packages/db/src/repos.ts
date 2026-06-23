import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  dataFreshness,
  fundamentalsSnapshots,
  ingestRuns,
  macroSnapshots,
  newsItems,
  ohlcvDaily,
  portfolioAccounts,
  portfolioPositions,
  shareholdingMonthly,
  tickers,
  watchlistTickers,
} from './schema.js';

export async function getTickerBySymbol(db: Db, symbol: string) {
  const rows = await db.select().from(tickers).where(eq(tickers.symbol, symbol.toUpperCase())).limit(1);
  return rows[0] ?? null;
}

export async function listTickers(db: Db) {
  return db.select().from(tickers).where(eq(tickers.isActive, true)).orderBy(tickers.symbol);
}

export async function ensureTicker(
  db: Db,
  symbol: string,
  meta?: { name?: string; sector?: string },
) {
  const existing = await getTickerBySymbol(db, symbol);
  if (existing) return existing;
  const [row] = await db
    .insert(tickers)
    .values({
      symbol: symbol.toUpperCase(),
      name: meta?.name,
      sector: meta?.sector,
    })
    .returning();
  return row!;
}

export async function upsertOhlcvBatch(
  db: Db,
  tickerId: number,
  rows: Array<{
    tradeDate: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    source: string;
  }>,
): Promise<number> {
  if (rows.length === 0) return 0;
  await db
    .insert(ohlcvDaily)
    .values(
      rows.map((r) => ({
        tickerId,
        tradeDate: r.tradeDate,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        source: r.source,
      })),
    )
    .onConflictDoUpdate({
      target: [ohlcvDaily.tickerId, ohlcvDaily.tradeDate],
      set: {
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        volume: sql`excluded.volume`,
        source: sql`excluded.source`,
        ingestedAt: new Date(),
      },
    });
  return rows.length;
}

export async function getOhlcv(
  db: Db,
  tickerId: number,
  opts?: { start?: string; end?: string; limit?: number },
) {
  const conditions = [eq(ohlcvDaily.tickerId, tickerId)];
  if (opts?.start) conditions.push(gte(ohlcvDaily.tradeDate, opts.start));
  if (opts?.end) conditions.push(lte(ohlcvDaily.tradeDate, opts.end));

  let rows = await db
    .select()
    .from(ohlcvDaily)
    .where(and(...conditions))
    .orderBy(ohlcvDaily.tradeDate);

  if (opts?.limit) {
    rows = rows.slice(-opts.limit);
  }
  return rows;
}

export async function upsertFundamentals(
  db: Db,
  tickerId: number,
  asOf: string,
  payload: Record<string, unknown>,
  source: string,
) {
  await db
    .insert(fundamentalsSnapshots)
    .values({ tickerId, asOf, payload, source })
    .onConflictDoUpdate({
      target: [fundamentalsSnapshots.tickerId, fundamentalsSnapshots.asOf, fundamentalsSnapshots.source],
      set: { payload, ingestedAt: new Date() },
    });
}

export async function getLatestFundamentals(db: Db, tickerId: number) {
  const rows = await db
    .select()
    .from(fundamentalsSnapshots)
    .where(eq(fundamentalsSnapshots.tickerId, tickerId))
    .orderBy(desc(fundamentalsSnapshots.asOf))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertShareholding(
  db: Db,
  tickerId: number,
  month: string,
  data: {
    sponsor?: number;
    govt?: number;
    institution?: number;
    foreign?: number;
    public?: number;
    source?: string;
  },
) {
  await db
    .insert(shareholdingMonthly)
    .values({
      tickerId,
      month,
      sponsor: data.sponsor,
      govt: data.govt,
      institution: data.institution,
      foreign: data.foreign,
      public: data.public,
      source: data.source ?? 'dse',
    })
    .onConflictDoUpdate({
      target: [shareholdingMonthly.tickerId, shareholdingMonthly.month],
      set: {
        sponsor: data.sponsor,
        govt: data.govt,
        institution: data.institution,
        foreign: data.foreign,
        public: data.public,
        source: data.source ?? 'dse',
        ingestedAt: new Date(),
      },
    });
}

export async function getShareholding(db: Db, tickerId: number, months = 4) {
  const rows = await db
    .select()
    .from(shareholdingMonthly)
    .where(eq(shareholdingMonthly.tickerId, tickerId))
    .orderBy(desc(shareholdingMonthly.month))
    .limit(months);
  return rows.reverse();
}

export async function upsertMacro(db: Db, asOf: string, payload: Record<string, unknown>, source: string) {
  await db.insert(macroSnapshots).values({ asOf, payload, source });
}

export async function getLatestMacro(db: Db) {
  const rows = await db.select().from(macroSnapshots).orderBy(desc(macroSnapshots.asOf)).limit(1);
  return rows[0] ?? null;
}

export async function upsertNews(
  db: Db,
  items: Array<{
    tickerId?: number | null;
    publishedDate: string;
    headline: string;
    source?: string;
    category?: string;
    url?: string;
  }>,
) {
  if (items.length === 0) return;
  await db.insert(newsItems).values(
    items.map((i) => ({
      tickerId: i.tickerId ?? null,
      publishedDate: i.publishedDate,
      headline: i.headline,
      source: i.source,
      category: i.category,
      url: i.url,
    })),
  );
}

export async function getNews(db: Db, tickerId?: number, days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  if (tickerId) {
    return db
      .select()
      .from(newsItems)
      .where(and(eq(newsItems.tickerId, tickerId), gte(newsItems.publishedDate, cutoffStr)))
      .orderBy(desc(newsItems.publishedDate))
      .limit(20);
  }
  return db
    .select()
    .from(newsItems)
    .where(gte(newsItems.publishedDate, cutoffStr))
    .orderBy(desc(newsItems.publishedDate))
    .limit(20);
}

export async function getDefaultAccount(db: Db) {
  const rows = await db.select().from(portfolioAccounts).limit(1);
  return rows[0] ?? null;
}

export async function getPortfolioPositions(db: Db, accountId: number) {
  return db
    .select({
      position: portfolioPositions,
      symbol: tickers.symbol,
    })
    .from(portfolioPositions)
    .innerJoin(tickers, eq(portfolioPositions.tickerId, tickers.id))
    .where(eq(portfolioPositions.accountId, accountId));
}

export async function upsertPosition(
  db: Db,
  accountId: number,
  tickerId: number,
  data: {
    qty: number;
    avgCost: number;
    sector?: string;
    stopLevel?: number;
    targetLevel?: number;
  },
) {
  await db
    .insert(portfolioPositions)
    .values({
      accountId,
      tickerId,
      qty: data.qty,
      avgCost: data.avgCost,
      sector: data.sector,
      stopLevel: data.stopLevel,
      targetLevel: data.targetLevel,
    })
    .onConflictDoUpdate({
      target: [portfolioPositions.accountId, portfolioPositions.tickerId],
      set: {
        qty: data.qty,
        avgCost: data.avgCost,
        sector: data.sector,
        stopLevel: data.stopLevel,
        targetLevel: data.targetLevel,
        updatedAt: new Date(),
      },
    });
}

export async function removePosition(db: Db, accountId: number, tickerId: number) {
  await db
    .delete(portfolioPositions)
    .where(and(eq(portfolioPositions.accountId, accountId), eq(portfolioPositions.tickerId, tickerId)));
}

export async function setAccount(
  db: Db,
  accountId: number,
  data: { capitalBdt?: number; riskPerTradePct?: number; label?: string },
) {
  await db
    .update(portfolioAccounts)
    .set({
      ...(data.capitalBdt !== undefined ? { capitalBdt: data.capitalBdt } : {}),
      ...(data.riskPerTradePct !== undefined ? { riskPerTradePct: data.riskPerTradePct } : {}),
      ...(data.label !== undefined ? { label: data.label } : {}),
      updatedAt: new Date(),
    })
    .where(eq(portfolioAccounts.id, accountId));
}

export async function recordIngestRun(
  db: Db,
  data: {
    jobName: string;
    tickerId?: number;
    status: string;
    rowsUpserted?: number;
    errorMessage?: string;
    source?: string;
    startedAt?: Date;
  },
) {
  const [row] = await db
    .insert(ingestRuns)
    .values({
      jobName: data.jobName,
      tickerId: data.tickerId,
      status: data.status,
      rowsUpserted: data.rowsUpserted ?? 0,
      errorMessage: data.errorMessage,
      source: data.source,
      startedAt: data.startedAt ?? new Date(),
      finishedAt: new Date(),
    })
    .returning();
  return row!;
}

export async function updateFreshness(
  db: Db,
  entityType: string,
  tickerId: number | null,
  success: boolean,
  staleAfterHours = 24,
) {
  const existing = await db
    .select()
    .from(dataFreshness)
    .where(
      tickerId
        ? and(eq(dataFreshness.entityType, entityType), eq(dataFreshness.tickerId, tickerId))
        : eq(dataFreshness.entityType, entityType),
    )
    .limit(1);

  const now = new Date();
  if (existing[0]) {
    await db
      .update(dataFreshness)
      .set({
        lastAttemptAt: now,
        ...(success ? { lastSuccessAt: now } : {}),
        staleAfterHours,
      })
      .where(eq(dataFreshness.id, existing[0].id));
  } else {
    await db.insert(dataFreshness).values({
      entityType,
      tickerId,
      lastAttemptAt: now,
      lastSuccessAt: success ? now : null,
      staleAfterHours,
    });
  }
}

export async function getFreshness(db: Db, tickerId?: number) {
  if (tickerId) {
    return db.select().from(dataFreshness).where(eq(dataFreshness.tickerId, tickerId));
  }
  return db.select().from(dataFreshness);
}

export async function getWatchlistSymbols(db: Db): Promise<string[]> {
  const rows = await db
    .select({ symbol: tickers.symbol })
    .from(watchlistTickers)
    .innerJoin(tickers, eq(watchlistTickers.tickerId, tickers.id));
  return rows.map((r) => r.symbol);
}

export async function addToWatchlist(db: Db, tickerId: number) {
  await db.insert(watchlistTickers).values({ tickerId }).onConflictDoNothing();
}
