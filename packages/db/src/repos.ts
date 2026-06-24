import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  analysisSnapshots,
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
  predictionOutcomes,
} from './schema.js';
import { findUniqueNearMatch, isStubTicker } from './symbols.js';

export async function getTickerBySymbol(db: Db, symbol: string) {
  const upper = symbol.toUpperCase();
  const active = await db.select().from(tickers).where(eq(tickers.isActive, true));
  const bySymbol = new Map(active.map((t) => [t.symbol, t]));
  const symbols = [...bySymbol.keys()];

  const exact = bySymbol.get(upper);
  if (exact) {
    const neighbor = findUniqueNearMatch(upper, symbols.filter((s) => s !== upper));
    if (neighbor) {
      const neighborRow = bySymbol.get(neighbor)!;
      if (isStubTicker(exact) && !isStubTicker(neighborRow)) {
        return neighborRow;
      }
    }
    return exact;
  }

  const neighbor = findUniqueNearMatch(upper, symbols);
  return neighbor ? (bySymbol.get(neighbor) ?? null) : null;
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

  const upper = symbol.toUpperCase();
  const active = await listTickers(db);
  const neighbor = findUniqueNearMatch(upper, active.map((t) => t.symbol));
  if (neighbor) {
    return active.find((t) => t.symbol === neighbor)!;
  }

  const [row] = await db
    .insert(tickers)
    .values({
      symbol: upper,
      name: meta?.name,
      sector: meta?.sector,
    })
    .returning();
  return row!;
}

/** Reassign FK rows from a stub typo ticker to its canonical neighbor, then deactivate the stub. */
export async function mergeStubTicker(db: Db, stubSymbol: string, canonicalSymbol: string) {
  const stub = await db
    .select()
    .from(tickers)
    .where(eq(tickers.symbol, stubSymbol.toUpperCase()))
    .limit(1);
  const canonical = await getTickerBySymbol(db, canonicalSymbol);
  if (!stub[0] || !canonical || stub[0].id === canonical.id) return false;

  const stubId = stub[0].id;
  const canonId = canonical.id;

  await db
    .update(analysisSnapshots)
    .set({ tickerId: canonId })
    .where(eq(analysisSnapshots.tickerId, stubId));
  await db.update(ingestRuns).set({ tickerId: canonId }).where(eq(ingestRuns.tickerId, stubId));
  await db
    .update(predictionOutcomes)
    .set({ tickerId: canonId })
    .where(eq(predictionOutcomes.tickerId, stubId));
  await db.update(newsItems).set({ tickerId: canonId }).where(eq(newsItems.tickerId, stubId));

  // Stub rows on unique (entity, ticker) / (ticker, date) keys — drop rather than collide.
  await db.delete(dataFreshness).where(eq(dataFreshness.tickerId, stubId));
  await db.delete(ohlcvDaily).where(eq(ohlcvDaily.tickerId, stubId));
  await db.delete(fundamentalsSnapshots).where(eq(fundamentalsSnapshots.tickerId, stubId));
  await db.delete(shareholdingMonthly).where(eq(shareholdingMonthly.tickerId, stubId));

  const stubWatch = await db
    .select()
    .from(watchlistTickers)
    .where(eq(watchlistTickers.tickerId, stubId));
  for (const w of stubWatch) {
    const clash = await db
      .select()
      .from(watchlistTickers)
      .where(
        and(eq(watchlistTickers.tickerId, canonId), eq(watchlistTickers.purpose, w.purpose)),
      )
      .limit(1);
    if (clash[0]) {
      await db.delete(watchlistTickers).where(eq(watchlistTickers.id, w.id));
    } else {
      await db.update(watchlistTickers).set({ tickerId: canonId }).where(eq(watchlistTickers.id, w.id));
    }
  }

  const stubPos = await db
    .select()
    .from(portfolioPositions)
    .where(eq(portfolioPositions.tickerId, stubId));
  for (const p of stubPos) {
    const clash = await db
      .select()
      .from(portfolioPositions)
      .where(
        and(
          eq(portfolioPositions.accountId, p.accountId),
          eq(portfolioPositions.tickerId, canonId),
        ),
      )
      .limit(1);
    if (clash[0]) {
      await db.delete(portfolioPositions).where(eq(portfolioPositions.id, p.id));
    } else {
      await db
        .update(portfolioPositions)
        .set({ tickerId: canonId })
        .where(eq(portfolioPositions.id, p.id));
    }
  }

  await db.update(tickers).set({ isActive: false }).where(eq(tickers.id, stubId));
  return true;
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
    .orderBy(desc(fundamentalsSnapshots.asOf), desc(fundamentalsSnapshots.ingestedAt))
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

export async function listWatchlist(
  db: Db,
  purpose?: 'investment' | 'trading',
) {
  const conditions = purpose ? [eq(watchlistTickers.purpose, purpose)] : [];
  return db
    .select({
      id: watchlistTickers.id,
      tickerId: watchlistTickers.tickerId,
      purpose: watchlistTickers.purpose,
      addedAt: watchlistTickers.addedAt,
      symbol: tickers.symbol,
      name: tickers.name,
      sector: tickers.sector,
      commodityType: tickers.commodityType,
    })
    .from(watchlistTickers)
    .innerJoin(tickers, eq(watchlistTickers.tickerId, tickers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(watchlistTickers.addedAt);
}

export async function addToWatchlist(
  db: Db,
  tickerId: number,
  purpose: 'investment' | 'trading' = 'investment',
) {
  await db
    .insert(watchlistTickers)
    .values({ tickerId, purpose })
    .onConflictDoNothing({ target: [watchlistTickers.tickerId, watchlistTickers.purpose] });
}

export async function removeFromWatchlist(
  db: Db,
  tickerId: number,
  purpose?: 'investment' | 'trading',
) {
  const conditions = [eq(watchlistTickers.tickerId, tickerId)];
  if (purpose) conditions.push(eq(watchlistTickers.purpose, purpose));
  await db.delete(watchlistTickers).where(and(...conditions));
}

export async function saveAnalysisSnapshot(
  db: Db,
  data: {
    tickerId: number;
    skill: string;
    asOf: string;
    payload: Record<string, unknown>;
    clientId?: string;
    modelVersion?: string;
  },
) {
  const [row] = await db
    .insert(analysisSnapshots)
    .values({
      tickerId: data.tickerId,
      skill: data.skill,
      asOf: data.asOf,
      payload: data.payload,
      clientId: data.clientId,
      modelVersion: data.modelVersion,
    })
    .returning();
  return row!;
}

export async function getLatestAnalysisSnapshot(
  db: Db,
  tickerId: number,
  skill = 'analyze_ticker',
) {
  const rows = await db
    .select()
    .from(analysisSnapshots)
    .where(and(eq(analysisSnapshots.tickerId, tickerId), eq(analysisSnapshots.skill, skill)))
    .orderBy(desc(analysisSnapshots.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAnalysisSnapshots(
  db: Db,
  tickerId: number,
  opts?: { skill?: string; limit?: number },
) {
  const conditions = [eq(analysisSnapshots.tickerId, tickerId)];
  if (opts?.skill) conditions.push(eq(analysisSnapshots.skill, opts.skill));

  return db
    .select()
    .from(analysisSnapshots)
    .where(and(...conditions))
    .orderBy(desc(analysisSnapshots.createdAt))
    .limit(opts?.limit ?? 20);
}

export async function listRecentAnalyses(db: Db, limit = 30) {
  const latestPerTicker = db
    .select({
      tickerId: analysisSnapshots.tickerId,
      maxCreated: sql<Date>`max(${analysisSnapshots.createdAt})`.as('max_created'),
    })
    .from(analysisSnapshots)
    .groupBy(analysisSnapshots.tickerId)
    .as('latest_per_ticker');

  const rows = await db
    .select({
      id: analysisSnapshots.id,
      skill: analysisSnapshots.skill,
      asOf: analysisSnapshots.asOf,
      createdAt: analysisSnapshots.createdAt,
      modelVersion: analysisSnapshots.modelVersion,
      symbol: tickers.symbol,
      investmentScore: sql<number | null>`(${analysisSnapshots.payload}->'synthesis'->'investment'->>'composite_1_10')::int`,
      momentumScore: sql<number | null>`(${analysisSnapshots.payload}->'synthesis'->'momentum'->>'composite_1_10')::int`,
      riskRating: sql<string | null>`${analysisSnapshots.payload}->'risk'->>'rating'`,
    })
    .from(analysisSnapshots)
    .innerJoin(tickers, eq(analysisSnapshots.tickerId, tickers.id))
    .innerJoin(
      latestPerTicker,
      and(
        eq(analysisSnapshots.tickerId, latestPerTicker.tickerId),
        eq(analysisSnapshots.createdAt, latestPerTicker.maxCreated),
      ),
    )
    .orderBy(desc(analysisSnapshots.createdAt))
    .limit(limit);

  return rows;
}

export async function getAnalyticsKpi(db: Db) {
  const [snapCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(analysisSnapshots);

  const outcomes = await db
    .select()
    .from(predictionOutcomes)
    .orderBy(desc(predictionOutcomes.signalDate))
    .limit(500);

  const with1m = outcomes.filter((o) => o.actualReturn1m != null);
  const wins1m = with1m.filter((o) => (o.actualReturn1m ?? 0) > 0);

  const agentStats = await db
    .select({
      agentName: predictionOutcomes.agentName,
      total: sql<number>`count(*)::int`,
      wins: sql<number>`count(*) filter (where ${predictionOutcomes.actualReturn1m} > 0)::int`,
    })
    .from(predictionOutcomes)
    .where(sql`${predictionOutcomes.agentName} is not null`)
    .groupBy(predictionOutcomes.agentName);

  return {
    total_snapshots: snapCount?.n ?? 0,
    total_outcomes: outcomes.length,
    win_rate_1m: with1m.length ? wins1m.length / with1m.length : null,
    agent_leaderboard: agentStats.map((a) => ({
      agent: a.agentName,
      total: a.total,
      wins: a.wins,
      win_rate: a.total ? a.wins / a.total : 0,
    })),
    recent_outcomes: outcomes.slice(0, 20),
    model_version: '2.0.0',
    governance_note: 'Structural weight changes require analyst approval (REQ-060).',
  };
}

export async function recordPredictionOutcome(
  db: Db,
  data: {
    tickerId: number;
    signalDate: string;
    predictedAction: string;
    predictedRating?: string;
    snapshotId?: number;
    agentName?: string;
    criterionId?: number;
    actualReturn1w?: number;
    actualReturn1m?: number;
    actualReturn3m?: number;
  },
) {
  const [row] = await db.insert(predictionOutcomes).values(data).returning();
  return row!;
}
