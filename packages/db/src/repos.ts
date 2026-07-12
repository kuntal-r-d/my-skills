import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { CANONICAL_SECTORS, normalizeSector, sectorSlug } from '@stock-buddy/core';
import { rowsFromExecute, type Db } from './client.js';
import {
  analysisSnapshots,
  dataFreshness,
  fundamentalsSnapshots,
  ingestRuns,
  macroSnapshots,
  newsItems,
  ohlcvDaily,
  portfolioAccounts,
  portfolioLots,
  portfolioPositions,
  researchMemos,
  researchSources,
  sectorSnapshots,
  sectors,
  skillOverrides,
  shareholdingMonthly,
  tickers,
  watchlistTickers,
  predictionOutcomes,
} from './schema.js';
import { findUniqueNearMatch, isStubTicker } from './symbols.js';

export async function getTickerBySymbolExact(db: Db, symbol: string) {
  const upper = symbol.toUpperCase();
  const rows = await db
    .select()
    .from(tickers)
    .where(and(eq(tickers.symbol, upper), eq(tickers.isActive, true)))
    .limit(1);
  return rows[0] ?? null;
}

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
  const upper = symbol.toUpperCase();
  const existing = await getTickerBySymbolExact(db, upper);
  if (existing) return existing;

  // A deactivated row (e.g. a merged typo stub) may still own the symbol.
  const [inactive] = await db
    .select()
    .from(tickers)
    .where(eq(tickers.symbol, upper))
    .limit(1);
  if (inactive) {
    const canonical = await getTickerBySymbol(db, upper);
    if (canonical) return canonical;
    const [revived] = await db
      .update(tickers)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(tickers.id, inactive.id))
      .returning();
    return revived!;
  }

  const [row] = await db
    .insert(tickers)
    .values({
      symbol: upper,
      name: meta?.name,
      sector: meta?.sector,
    })
    .onConflictDoUpdate({
      target: tickers.symbol,
      set: { isActive: true, updatedAt: new Date() },
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

  const stubLots = await db
    .select()
    .from(portfolioLots)
    .where(eq(portfolioLots.tickerId, stubId));
  for (const lot of stubLots) {
    await db
      .update(portfolioLots)
      .set({ tickerId: canonId })
      .where(eq(portfolioLots.id, lot.id));
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
    sectorTag?: string;
    url?: string;
  }>,
): Promise<{ inserted: number; skipped: number }> {
  if (items.length === 0) return { inserted: 0, skipped: 0 };

  const urls = [...new Set(items.map((i) => i.url).filter(Boolean))] as string[];
  const existingUrls = new Set<string>();
  if (urls.length) {
    const rows = await db
      .select({ url: newsItems.url })
      .from(newsItems)
      .where(inArray(newsItems.url, urls));
    for (const r of rows) {
      if (r.url) existingUrls.add(r.url);
    }
  }

  const fresh = items.filter((i) => !i.url || !existingUrls.has(i.url));
  let retagged = 0;
  for (const item of items) {
    if (!item.url || !item.tickerId || !existingUrls.has(item.url)) continue;
    const updated = await db
      .update(newsItems)
      .set({ tickerId: item.tickerId })
      .where(and(eq(newsItems.url, item.url), isNull(newsItems.tickerId)))
      .returning({ id: newsItems.id });
    retagged += updated.length;
  }

  if (fresh.length === 0) {
    return { inserted: retagged, skipped: items.length - retagged };
  }

  await db.insert(newsItems).values(
    fresh.map((i) => ({
      tickerId: i.tickerId ?? null,
      publishedDate: i.publishedDate,
      headline: i.headline,
      source: i.source,
      category: i.category,
      sectorTag: i.sectorTag,
      url: i.url,
    })),
  );
  return { inserted: fresh.length + retagged, skipped: items.length - fresh.length - retagged };
}

export async function retagUntaggedNews(
  db: Db,
  tagger: (headline: string, url?: string | null) => number | null,
  limit = 1000,
): Promise<number> {
  const rows = await db
    .select({ id: newsItems.id, headline: newsItems.headline, url: newsItems.url })
    .from(newsItems)
    .where(isNull(newsItems.tickerId))
    .orderBy(desc(newsItems.publishedDate))
    .limit(limit);

  let updated = 0;
  for (const row of rows) {
    const tickerId = tagger(row.headline, row.url);
    if (!tickerId) continue;
    const hit = await db
      .update(newsItems)
      .set({ tickerId })
      .where(eq(newsItems.id, row.id))
      .returning({ id: newsItems.id });
    updated += hit.length;
  }
  return updated;
}

export async function getNews(db: Db, tickerId?: number, days = 7, limit = 20) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  if (tickerId) {
    return db
      .select()
      .from(newsItems)
      .where(and(eq(newsItems.tickerId, tickerId), gte(newsItems.publishedDate, cutoffStr)))
      .orderBy(desc(newsItems.publishedDate))
      .limit(limit);
  }
  return db
    .select()
    .from(newsItems)
    .where(gte(newsItems.publishedDate, cutoffStr))
    .orderBy(desc(newsItems.publishedDate))
    .limit(limit);
}

export async function getDefaultAccount(db: Db) {
  const rows = await db.select().from(portfolioAccounts).limit(1);
  return rows[0] ?? null;
}

export type PortfolioPurpose = 'investment' | 'trading';
export type PositionUpsertMode = 'add' | 'replace';

export async function getPortfolioPositions(
  db: Db,
  accountId: number,
  purpose?: PortfolioPurpose,
) {
  const conditions = [eq(portfolioPositions.accountId, accountId)];
  if (purpose) conditions.push(eq(portfolioPositions.purpose, purpose));

  return db
    .select({
      position: portfolioPositions,
      symbol: tickers.symbol,
    })
    .from(portfolioPositions)
    .innerJoin(tickers, eq(portfolioPositions.tickerId, tickers.id))
    .where(and(...conditions));
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
    purpose?: PortfolioPurpose;
  },
  mode: PositionUpsertMode = 'add',
) {
  const purpose = data.purpose ?? 'investment';
  const values = {
    accountId,
    tickerId,
    purpose,
    qty: data.qty,
    avgCost: data.avgCost,
    sector: data.sector,
    stopLevel: data.stopLevel,
    targetLevel: data.targetLevel,
  };

  if (mode === 'replace') {
    await db
      .insert(portfolioPositions)
      .values(values)
      .onConflictDoUpdate({
        target: [portfolioPositions.accountId, portfolioPositions.tickerId, portfolioPositions.purpose],
        set: {
          qty: data.qty,
          avgCost: data.avgCost,
          sector: data.sector,
          stopLevel: data.stopLevel,
          targetLevel: data.targetLevel,
          updatedAt: new Date(),
        },
      });
    return;
  }

  await db
    .insert(portfolioPositions)
    .values(values)
    .onConflictDoUpdate({
      target: [portfolioPositions.accountId, portfolioPositions.tickerId, portfolioPositions.purpose],
      set: {
        qty: sql`${portfolioPositions.qty} + excluded.qty`,
        avgCost: sql`((${portfolioPositions.qty} * ${portfolioPositions.avgCost}) + (excluded.qty * excluded.avg_cost)) / (${portfolioPositions.qty} + excluded.qty)`,
        sector: sql`COALESCE(excluded.sector, ${portfolioPositions.sector})`,
        stopLevel: sql`COALESCE(excluded.stop_level, ${portfolioPositions.stopLevel})`,
        targetLevel: sql`COALESCE(excluded.target_level, ${portfolioPositions.targetLevel})`,
        updatedAt: new Date(),
      },
    });
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function deletePortfolioLots(
  db: Db,
  accountId: number,
  tickerId: number,
  purpose: PortfolioPurpose,
) {
  await db
    .delete(portfolioLots)
    .where(
      and(
        eq(portfolioLots.accountId, accountId),
        eq(portfolioLots.tickerId, tickerId),
        eq(portfolioLots.purpose, purpose),
      ),
    );
}

export async function addPortfolioFill(
  db: Db,
  accountId: number,
  tickerId: number,
  data: {
    qty: number;
    price: number;
    tradeDate?: string;
    purpose?: PortfolioPurpose;
    sector?: string;
    stopLevel?: number;
    targetLevel?: number;
    notes?: string;
  },
) {
  const purpose = data.purpose ?? 'investment';
  const tradeDate = data.tradeDate ?? todayDateStr();

  await upsertPosition(
    db,
    accountId,
    tickerId,
    {
      qty: data.qty,
      avgCost: data.price,
      sector: data.sector,
      stopLevel: data.stopLevel,
      targetLevel: data.targetLevel,
      purpose,
    },
    'add',
  );

  const [lot] = await db
    .insert(portfolioLots)
    .values({
      accountId,
      tickerId,
      purpose,
      tradeDate,
      qty: data.qty,
      price: data.price,
      notes: data.notes,
    })
    .returning();
  return lot!;
}

export async function replacePortfolioPositionWithFill(
  db: Db,
  accountId: number,
  tickerId: number,
  data: {
    qty: number;
    price: number;
    tradeDate?: string;
    purpose?: PortfolioPurpose;
    sector?: string;
    stopLevel?: number;
    targetLevel?: number;
    notes?: string;
  },
) {
  const purpose = data.purpose ?? 'investment';
  const tradeDate = data.tradeDate ?? todayDateStr();

  await upsertPosition(
    db,
    accountId,
    tickerId,
    {
      qty: data.qty,
      avgCost: data.price,
      sector: data.sector,
      stopLevel: data.stopLevel,
      targetLevel: data.targetLevel,
      purpose,
    },
    'replace',
  );
  await deletePortfolioLots(db, accountId, tickerId, purpose);
  const [lot] = await db
    .insert(portfolioLots)
    .values({
      accountId,
      tickerId,
      purpose,
      tradeDate,
      qty: data.qty,
      price: data.price,
      notes: data.notes ?? 'Imported from position total',
    })
    .returning();
  return lot!;
}

export async function getPortfolioLots(
  db: Db,
  accountId: number,
  tickerId: number,
  purpose: PortfolioPurpose,
) {
  return db
    .select()
    .from(portfolioLots)
    .where(
      and(
        eq(portfolioLots.accountId, accountId),
        eq(portfolioLots.tickerId, tickerId),
        eq(portfolioLots.purpose, purpose),
      ),
    )
    .orderBy(desc(portfolioLots.tradeDate), desc(portfolioLots.createdAt));
}

/** Oldest lots first — used for FIFO partial transfers between books. */
export async function getPortfolioLotsFifo(
  db: Db,
  accountId: number,
  tickerId: number,
  purpose: PortfolioPurpose,
) {
  return db
    .select()
    .from(portfolioLots)
    .where(
      and(
        eq(portfolioLots.accountId, accountId),
        eq(portfolioLots.tickerId, tickerId),
        eq(portfolioLots.purpose, purpose),
      ),
    )
    .orderBy(asc(portfolioLots.tradeDate), asc(portfolioLots.createdAt));
}

export async function countPortfolioLotsByTicker(
  db: Db,
  accountId: number,
  purpose: PortfolioPurpose,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      tickerId: portfolioLots.tickerId,
      n: sql<number>`cast(count(*) as integer)`,
    })
    .from(portfolioLots)
    .where(and(eq(portfolioLots.accountId, accountId), eq(portfolioLots.purpose, purpose)))
    .groupBy(portfolioLots.tickerId);

  return new Map(rows.map((r) => [r.tickerId, r.n]));
}

export async function copyPortfolioLots(
  db: Db,
  accountId: number,
  tickerId: number,
  from: PortfolioPurpose,
  to: PortfolioPurpose,
) {
  const source = await getPortfolioLots(db, accountId, tickerId, from);
  if (!source.length) return;

  await db.insert(portfolioLots).values(
    source.map((lot) => ({
      accountId,
      tickerId,
      purpose: to,
      tradeDate: lot.tradeDate,
      qty: lot.qty,
      price: lot.price,
      notes: lot.notes ? `${lot.notes} (copied from ${from})` : `Copied from ${from}`,
    })),
  );
  await recomputePortfolioPositionFromLots(db, accountId, tickerId, to);
}

export async function recomputePortfolioPositionFromLots(
  db: Db,
  accountId: number,
  tickerId: number,
  purpose: PortfolioPurpose,
) {
  const lots = await getPortfolioLots(db, accountId, tickerId, purpose);
  if (!lots.length) {
    await removePosition(db, accountId, tickerId, purpose);
    return null;
  }
  let totalQty = 0;
  let totalCost = 0;
  for (const lot of lots) {
    totalQty += lot.qty;
    totalCost += lot.qty * lot.price;
  }
  const avgCost = totalCost / totalQty;
  const positionRows = await getPortfolioPositions(db, accountId, purpose);
  const existing = positionRows.find((r) => r.position.tickerId === tickerId);
  await upsertPosition(
    db,
    accountId,
    tickerId,
    {
      qty: totalQty,
      avgCost,
      sector: existing?.position.sector ?? undefined,
      stopLevel: existing?.position.stopLevel ?? undefined,
      targetLevel: existing?.position.targetLevel ?? undefined,
      purpose,
    },
    'replace',
  );
  return {
    qty: totalQty,
    avg_cost: avgCost,
    cost_basis: totalCost,
  };
}

export async function getPortfolioLotById(db: Db, accountId: number, lotId: number) {
  const [lot] = await db
    .select()
    .from(portfolioLots)
    .where(and(eq(portfolioLots.id, lotId), eq(portfolioLots.accountId, accountId)));
  return lot ?? null;
}

export async function updatePortfolioLot(
  db: Db,
  accountId: number,
  lotId: number,
  data: {
    qty?: number;
    price?: number;
    tradeDate?: string;
    notes?: string | null;
  },
) {
  const lot = await getPortfolioLotById(db, accountId, lotId);
  if (!lot) return null;

  const [updated] = await db
    .update(portfolioLots)
    .set({
      ...(data.qty !== undefined ? { qty: data.qty } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.tradeDate !== undefined ? { tradeDate: data.tradeDate } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    })
    .where(eq(portfolioLots.id, lotId))
    .returning();

  const position = await recomputePortfolioPositionFromLots(db, accountId, lot.tickerId, lot.purpose as PortfolioPurpose);
  return { lot: updated!, tickerId: lot.tickerId, purpose: lot.purpose as PortfolioPurpose, position };
}

export async function deletePortfolioLot(db: Db, accountId: number, lotId: number) {
  const lot = await getPortfolioLotById(db, accountId, lotId);
  if (!lot) return null;

  await db.delete(portfolioLots).where(eq(portfolioLots.id, lotId));
  const position = await recomputePortfolioPositionFromLots(db, accountId, lot.tickerId, lot.purpose as PortfolioPurpose);
  return { tickerId: lot.tickerId, purpose: lot.purpose as PortfolioPurpose, position };
}

export async function removePosition(
  db: Db,
  accountId: number,
  tickerId: number,
  purpose: PortfolioPurpose = 'investment',
) {
  await deletePortfolioLots(db, accountId, tickerId, purpose);
  await db
    .delete(portfolioPositions)
    .where(
      and(
        eq(portfolioPositions.accountId, accountId),
        eq(portfolioPositions.tickerId, tickerId),
        eq(portfolioPositions.purpose, purpose),
      ),
    );
}

export async function splitPortfolioLot(
  db: Db,
  accountId: number,
  lotId: number,
  splitQty: number,
  splitPrice?: number,
) {
  const lot = await getPortfolioLotById(db, accountId, lotId);
  if (!lot) return null;
  if (!splitQty || splitQty <= 0 || splitQty >= lot.qty) {
    throw new Error('split_qty must be greater than 0 and less than the lot qty');
  }

  const purpose = lot.purpose as PortfolioPurpose;
  const remainQty = lot.qty - splitQty;
  const totalCost = lot.qty * lot.price;
  const effSplitPrice = splitPrice ?? lot.price;
  if (!effSplitPrice || effSplitPrice <= 0) {
    throw new Error('split_price must be positive');
  }

  const splitCost = splitQty * effSplitPrice;
  const remainCost = totalCost - splitCost;
  if (remainCost <= 0) {
    throw new Error('split price too high — remaining lot cost would be zero or negative');
  }
  const remainPrice = remainCost / remainQty;

  await db
    .update(portfolioLots)
    .set({ qty: remainQty, price: remainPrice })
    .where(eq(portfolioLots.id, lotId));
  const [splitLot] = await db
    .insert(portfolioLots)
    .values({
      accountId,
      tickerId: lot.tickerId,
      purpose,
      tradeDate: lot.tradeDate,
      qty: splitQty,
      price: effSplitPrice,
      notes: lot.notes ? `${lot.notes} (split)` : 'Split from lot',
    })
    .returning();

  const position = await recomputePortfolioPositionFromLots(db, accountId, lot.tickerId, purpose);
  return {
    lot: splitLot!,
    remain_qty: remainQty,
    remain_price: remainPrice,
    remain_cost: remainCost,
    tickerId: lot.tickerId,
    purpose,
    position,
  };
}

export type MovePortfolioLotResult = {
  lot_id: number;
  ticker_id: number;
  symbol?: string;
  from: PortfolioPurpose;
  to: PortfolioPurpose;
  moved_qty: number;
  moved_price: number;
  from_position: { qty: number; avg_cost: number; cost_basis: number } | null;
  to_position: { qty: number; avg_cost: number; cost_basis: number } | null;
};

/** Move one buy-history lot to the other book; both positions recompute from remaining fills. */
export async function movePortfolioLot(
  db: Db,
  accountId: number,
  lotId: number,
  to: PortfolioPurpose,
): Promise<MovePortfolioLotResult | null> {
  const lot = await getPortfolioLotById(db, accountId, lotId);
  if (!lot) return null;

  const from = lot.purpose as PortfolioPurpose;
  if (from === to) throw new Error('fill is already in that portfolio');

  const sourceRows = await getPortfolioPositions(db, accountId, from);
  const source = sourceRows.find((r) => r.position.tickerId === lot.tickerId);
  const destRows = await getPortfolioPositions(db, accountId, to);
  const hadDest = destRows.some((r) => r.position.tickerId === lot.tickerId);

  await db.update(portfolioLots).set({ purpose: to }).where(eq(portfolioLots.id, lotId));

  const fromPosition = await recomputePortfolioPositionFromLots(db, accountId, lot.tickerId, from);
  const toPosition = await recomputePortfolioPositionFromLots(db, accountId, lot.tickerId, to);

  if (toPosition && source) {
    await applyMoveDestinationMetadata(db, accountId, lot.tickerId, to, hadDest, source.position);
  }

  return {
    lot_id: lotId,
    ticker_id: lot.tickerId,
    from,
    to,
    moved_qty: lot.qty,
    moved_price: lot.price,
    from_position: fromPosition,
    to_position: toPosition,
  };
}

async function ensurePortfolioLotsForPosition(
  db: Db,
  accountId: number,
  tickerId: number,
  purpose: PortfolioPurpose,
  position: { qty: number; avgCost: number },
) {
  const lots = await getPortfolioLots(db, accountId, tickerId, purpose);
  if (lots.length || position.qty <= 0) return lots;
  await db.insert(portfolioLots).values({
    accountId,
    tickerId,
    purpose,
    tradeDate: todayDateStr(),
    qty: position.qty,
    price: position.avgCost,
    notes: 'Backfill from position (pre-lots)',
  });
  return getPortfolioLotsFifo(db, accountId, tickerId, purpose);
}

async function transferPortfolioLotsFifo(
  db: Db,
  accountId: number,
  tickerId: number,
  from: PortfolioPurpose,
  to: PortfolioPurpose,
  moveQty: number,
) {
  const lots = await getPortfolioLotsFifo(db, accountId, tickerId, from);
  let remaining = moveQty;
  let transferred = 0;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    if (take <= 0) continue;

    if (take >= lot.qty) {
      await db.update(portfolioLots).set({ purpose: to }).where(eq(portfolioLots.id, lot.id));
    } else {
      await db.update(portfolioLots).set({ qty: lot.qty - take }).where(eq(portfolioLots.id, lot.id));
      await db.insert(portfolioLots).values({
        accountId,
        tickerId,
        purpose: to,
        tradeDate: lot.tradeDate,
        qty: take,
        price: lot.price,
        notes: lot.notes,
      });
    }
    remaining -= take;
    transferred += take;
  }

  return transferred;
}

async function applyMoveDestinationMetadata(
  db: Db,
  accountId: number,
  tickerId: number,
  to: PortfolioPurpose,
  hadDest: boolean,
  srcPos: {
    sector?: string | null;
    stopLevel?: number | null;
    targetLevel?: number | null;
  },
) {
  if (!hadDest && to === 'trading') {
    await db
      .update(portfolioPositions)
      .set({
        sector: srcPos.sector ?? null,
        stopLevel: srcPos.stopLevel ?? null,
        targetLevel: srcPos.targetLevel ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(portfolioPositions.accountId, accountId),
          eq(portfolioPositions.tickerId, tickerId),
          eq(portfolioPositions.purpose, to),
        ),
      );
    return;
  }

  if (!hadDest && to === 'investment') {
    await db
      .update(portfolioPositions)
      .set({
        sector: srcPos.sector ?? null,
        stopLevel: null,
        targetLevel: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(portfolioPositions.accountId, accountId),
          eq(portfolioPositions.tickerId, tickerId),
          eq(portfolioPositions.purpose, to),
        ),
      );
    return;
  }

  if (hadDest && to === 'investment') {
    await db
      .update(portfolioPositions)
      .set({
        stopLevel: null,
        targetLevel: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(portfolioPositions.accountId, accountId),
          eq(portfolioPositions.tickerId, tickerId),
          eq(portfolioPositions.purpose, to),
        ),
      );
  }
}

export type MovePortfolioResult = {
  moved_qty: number;
  from_qty: number;
  to_qty: number;
  partial: boolean;
};

export async function movePortfolioPosition(
  db: Db,
  accountId: number,
  tickerId: number,
  from: PortfolioPurpose,
  to: PortfolioPurpose,
  options?: { qty?: number },
): Promise<MovePortfolioResult | false> {
  if (from === to) throw new Error('from and to must differ');

  const sourceRows = await getPortfolioPositions(db, accountId, from);
  const source = sourceRows.find((r) => r.position.tickerId === tickerId);
  if (!source) return false;

  const destRows = await getPortfolioPositions(db, accountId, to);
  const hadDest = destRows.some((r) => r.position.tickerId === tickerId);
  const { position: srcPos } = source;

  const requestedQty = options?.qty;
  const qtyToMove =
    requestedQty == null || requestedQty >= srcPos.qty ? srcPos.qty : requestedQty;
  if (qtyToMove <= 0) throw new Error('qty must be positive');
  if (qtyToMove > srcPos.qty) throw new Error('qty exceeds available shares');

  await ensurePortfolioLotsForPosition(db, accountId, tickerId, from, srcPos);

  const transferred = await transferPortfolioLotsFifo(db, accountId, tickerId, from, to, qtyToMove);
  if (transferred !== qtyToMove) {
    throw new Error('Could not transfer requested qty — lot history may be out of sync');
  }

  await recomputePortfolioPositionFromLots(db, accountId, tickerId, from);
  const destPosition = await recomputePortfolioPositionFromLots(db, accountId, tickerId, to);

  if (destPosition) {
    await applyMoveDestinationMetadata(db, accountId, tickerId, to, hadDest, srcPos);
  }

  const fromAfter = await getPortfolioPositions(db, accountId, from);
  const toAfter = await getPortfolioPositions(db, accountId, to);
  const fromRow = fromAfter.find((r) => r.position.tickerId === tickerId);
  const toRow = toAfter.find((r) => r.position.tickerId === tickerId);

  return {
    moved_qty: qtyToMove,
    from_qty: fromRow?.position.qty ?? 0,
    to_qty: toRow?.position.qty ?? qtyToMove,
    partial: qtyToMove < srcPos.qty,
  };
}

export async function setAccount(
  db: Db,
  accountId: number,
  data: { capitalBdt?: number; riskPerTradePct?: number; label?: string; loanBalanceBdt?: number | null; purchasingPowerBdt?: number | null },
) {
  await db
    .update(portfolioAccounts)
    .set({
      ...(data.capitalBdt !== undefined ? { capitalBdt: data.capitalBdt } : {}),
      ...(data.riskPerTradePct !== undefined ? { riskPerTradePct: data.riskPerTradePct } : {}),
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.loanBalanceBdt !== undefined ? { loanBalanceBdt: data.loanBalanceBdt } : {}),
      ...(data.purchasingPowerBdt !== undefined ? { purchasingPowerBdt: data.purchasingPowerBdt } : {}),
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
    .innerJoin(tickers, eq(watchlistTickers.tickerId, tickers.id))
    .where(eq(tickers.isActive, true));
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
      investmentScore: sql<number | null>`CAST(json_extract(${analysisSnapshots.payload}, '$.synthesis.investment.composite_1_10') AS INTEGER)`,
      momentumScore: sql<number | null>`CAST(json_extract(${analysisSnapshots.payload}, '$.synthesis.momentum.composite_1_10') AS INTEGER)`,
      riskRating: sql<string | null>`json_extract(${analysisSnapshots.payload}, '$.risk.rating')`,
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
    .select({ n: sql<number>`cast(count(*) as integer)` })
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
      total: sql<number>`cast(count(*) as integer)`,
      wins: sql<number>`cast(count(*) filter (where ${predictionOutcomes.actualReturn1m} > 0) as integer)`,
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

export function extractAnalysisScores(payload: Record<string, unknown> | undefined) {
  const syn = payload?.synthesis as Record<string, unknown> | undefined;
  const inv = syn?.investment as Record<string, unknown> | undefined;
  const mom = syn?.momentum as Record<string, unknown> | undefined;
  const risk = payload?.risk as Record<string, unknown> | undefined;
  return {
    investment_score: inv?.composite_1_10 as number | undefined,
    momentum_score: mom?.composite_1_10 as number | undefined,
    investment_rating: inv?.rating as string | undefined,
    momentum_rating: mom?.rating as string | undefined,
    risk_rating: risk?.rating as string | undefined,
  };
}

export function extractExtendedAnalysisFields(payload: Record<string, unknown> | undefined) {
  const scores = extractAnalysisScores(payload);
  const vc = payload?.value_investment_checklist as Record<string, unknown> | undefined;
  const km = vc?.key_metrics as Record<string, unknown> | undefined;
  const mt = payload?.momentum_trading as Record<string, unknown> | undefined;
  const summary = mt?.summary as Record<string, unknown> | undefined;
  const ms = payload?.momentum_screen as Record<string, unknown> | undefined;
  const msk = ms?.key_metrics as Record<string, unknown> | undefined;
  return {
    ...scores,
    value_grade: vc?.rating as string | undefined,
    gpa: km?.gpa as number | undefined,
    momentum_grade: (summary?.rating ?? summary?.consensus_grade ?? ms?.rating) as string | undefined,
    momentum_count: (summary?.overall_count ?? msk?.overall_count) as string | undefined,
  };
}

export function extractRiskMetrics(payload: Record<string, unknown> | undefined) {
  const risk = payload?.risk as Record<string, unknown> | undefined;
  const km = risk?.key_metrics as Record<string, unknown> | undefined;
  if (!km) return {};
  const strategies = risk?.strategies as Record<string, Record<string, unknown>> | undefined;
  const structKm = strategies?.structure?.key_metrics as Record<string, unknown> | undefined;
  const structure = structKm
    ? {
        buy_zone_low: structKm.buy_zone_low as number | undefined,
        buy_zone_high: structKm.buy_zone_high as number | undefined,
        stop_loss: structKm.stop_loss as number | undefined,
        target: structKm.target as number | undefined,
        support: structKm.support as number | undefined,
        resistance: structKm.resistance as number | undefined,
        next_support: structKm.next_support as number | undefined,
        next_resistance: structKm.next_resistance as number | undefined,
        position_value_bdt: structKm.position_value_bdt as number | undefined,
        suggested_shares: structKm.suggested_shares as number | undefined,
        pct_of_capital: structKm.pct_of_capital as number | undefined,
        risk_reward: structKm.risk_reward as number | undefined,
        entry: structKm.entry as number | undefined,
      }
    : undefined;
  return {
    atr: km.atr as number | undefined,
    entry: km.entry as number | undefined,
    buy_zone_low: km.buy_zone_low as number | undefined,
    buy_zone_high: km.buy_zone_high as number | undefined,
    stop_loss: km.stop_loss as number | undefined,
    target: km.target as number | undefined,
    position_value_bdt: km.position_value_bdt as number | undefined,
    suggested_shares: km.suggested_shares as number | undefined,
    pct_of_capital: km.pct_of_capital as number | undefined,
    risk_reward: km.risk_reward as number | undefined,
    strategies,
    structure,
    structure_rating: strategies?.structure?.rating as string | undefined,
  };
}

export function roc1mPctFromOhlcv(bars: { close: number }[], lookback = 21): number | null {
  if (bars.length < lookback + 1) return null;
  const last = bars[bars.length - 1]?.close;
  const past = bars[bars.length - 1 - lookback]?.close;
  if (last == null || past == null || past <= 0) return null;
  return Math.round(((last - past) / past) * 10000) / 100;
}

export interface TopPerformerRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  roc_1m_pct: number;
  last_close: number;
  last_trade_date: string;
}

export async function listTopPerformers(db: Db, limit = 10, lookbackBars = 21): Promise<TopPerformerRow[]> {
  const pastRn = lookbackBars + 1;
  const rows = rowsFromExecute<TopPerformerRow>(
    db.all(sql`
      WITH ranked AS (
        SELECT ticker_id, close, trade_date,
          ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY trade_date DESC) AS rn
        FROM ohlcv_daily
      )
      SELECT t.symbol, t.name, t.sector,
        ROUND(((last.close - past.close) / past.close * 100), 2) AS roc_1m_pct,
        last.close AS last_close,
        last.trade_date AS last_trade_date
      FROM tickers t
      JOIN ranked last ON last.ticker_id = t.id AND last.rn = 1
      JOIN ranked past ON past.ticker_id = t.id AND past.rn = ${pastRn}
      WHERE past.close > 0 AND last.close > 0 AND t.is_active = 1
      ORDER BY roc_1m_pct DESC
      LIMIT ${limit}
    `),
  );
  return rows;
}

export type ResearchSourceInput = {
  tickerId?: number | null;
  url?: string;
  title: string;
  publisher?: string;
  publishedDate?: string;
  queryContext?: string;
  category?: string;
  extractedFacts?: Record<string, unknown>;
  sessionId?: string;
  clientId?: string;
  notes?: string;
};

function researchSourceKey(url: string | null | undefined, tickerId: number | null | undefined): string {
  return `${url ?? ''}::${tickerId ?? 'none'}`;
}

/** Save agent/web research citations; dedupes by url + ticker_id. */
export async function upsertResearchSources(
  db: Db,
  items: ResearchSourceInput[],
  defaults?: {
    tickerId?: number | null;
    memoId?: number | null;
    sessionId?: string;
    clientId?: string;
    queryContext?: string;
  },
): Promise<{ inserted: number; updated: number; ids: number[] }> {
  if (items.length === 0) return { inserted: 0, updated: 0, ids: [] };

  const memoId = defaults?.memoId ?? null;

  const normalized = items.map((item) => ({
    tickerId: item.tickerId ?? defaults?.tickerId ?? null,
    url: item.url?.trim() || undefined,
    title: item.title.trim(),
    publisher: item.publisher?.trim(),
    publishedDate: item.publishedDate,
    queryContext: item.queryContext ?? defaults?.queryContext,
    category: item.category,
    extractedFacts: item.extractedFacts,
    sessionId: item.sessionId ?? defaults?.sessionId,
    clientId: item.clientId ?? defaults?.clientId,
    notes: item.notes,
  }));

  const urls = [...new Set(normalized.map((i) => i.url).filter(Boolean))] as string[];
  const existingByKey = new Map<string, { id: number }>();

  if (urls.length) {
    const rows = await db
      .select({
        id: researchSources.id,
        url: researchSources.url,
        tickerId: researchSources.tickerId,
      })
      .from(researchSources)
      .where(inArray(researchSources.url, urls));
    for (const row of rows) {
      existingByKey.set(researchSourceKey(row.url, row.tickerId), { id: row.id });
    }
  }

  let inserted = 0;
  let updated = 0;
  const ids: number[] = [];

  for (const item of normalized) {
    const key = researchSourceKey(item.url, item.tickerId);
    const existing = item.url ? existingByKey.get(key) : undefined;

    if (existing) {
      const [row] = await db
        .update(researchSources)
        .set({
          memoId,
          title: item.title,
          publisher: item.publisher,
          publishedDate: item.publishedDate,
          queryContext: item.queryContext,
          category: item.category,
          extractedFacts: item.extractedFacts,
          sessionId: item.sessionId,
          clientId: item.clientId,
          notes: item.notes,
          fetchedAt: new Date(),
          ingestedAt: new Date(),
        })
        .where(eq(researchSources.id, existing.id))
        .returning({ id: researchSources.id });
      if (row) {
        updated++;
        ids.push(row.id);
      }
      continue;
    }

    const [row] = await db
      .insert(researchSources)
      .values({
        memoId,
        tickerId: item.tickerId,
        url: item.url,
        title: item.title,
        publisher: item.publisher,
        publishedDate: item.publishedDate,
        queryContext: item.queryContext,
        category: item.category,
        extractedFacts: item.extractedFacts,
        sessionId: item.sessionId,
        clientId: item.clientId,
        notes: item.notes,
      })
      .returning({ id: researchSources.id });

    if (row) {
      inserted++;
      ids.push(row.id);
      if (item.url) existingByKey.set(key, { id: row.id });
    }
  }

  return { inserted, updated, ids };
}

export async function getResearchSources(
  db: Db,
  opts?: {
    tickerId?: number;
    memoId?: number;
    sessionId?: string;
    category?: string;
    days?: number;
    limit?: number;
  },
) {
  const days = opts?.days ?? 90;
  const limit = opts?.limit ?? 50;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const conditions = [gte(researchSources.fetchedAt, new Date(`${cutoffDate}T00:00:00Z`))];
  if (opts?.tickerId != null) conditions.push(eq(researchSources.tickerId, opts.tickerId));
  if (opts?.memoId != null) conditions.push(eq(researchSources.memoId, opts.memoId));
  if (opts?.sessionId) conditions.push(eq(researchSources.sessionId, opts.sessionId));
  if (opts?.category) conditions.push(eq(researchSources.category, opts.category));

  return db
    .select()
    .from(researchSources)
    .where(and(...conditions))
    .orderBy(desc(researchSources.fetchedAt))
    .limit(limit);
}

export type ResearchMemoInput = {
  tickerId?: number | null;
  sessionId?: string;
  clientId?: string;
  title: string;
  bodyMd: string;
  summaryJson?: Record<string, unknown>;
  asOf?: string;
  parentMemoId?: number;
};

/** Save or update a full markdown research memo. Upserts by memo id, or session_id + ticker_id. */
export async function upsertResearchMemo(
  db: Db,
  input: ResearchMemoInput,
  opts?: { memoId?: number; linkSessionSources?: boolean },
): Promise<{ id: number; version: number; sources_linked: number }> {
  const bodyMd = input.bodyMd.trim();
  if (!bodyMd) throw new Error('body_md required');

  let row: typeof researchMemos.$inferSelect | undefined;

  if (opts?.memoId) {
    const [updated] = await db
      .update(researchMemos)
      .set({
        title: input.title.trim(),
        bodyMd,
        summaryJson: input.summaryJson,
        asOf: input.asOf,
        sessionId: input.sessionId,
        clientId: input.clientId,
        updatedAt: new Date(),
      })
      .where(eq(researchMemos.id, opts.memoId))
      .returning();
    row = updated;
  } else if (input.sessionId && input.tickerId != null) {
    const existing = await db
      .select()
      .from(researchMemos)
      .where(and(eq(researchMemos.sessionId, input.sessionId), eq(researchMemos.tickerId, input.tickerId)))
      .orderBy(desc(researchMemos.createdAt))
      .limit(1);
    if (existing[0]) {
      const [updated] = await db
        .update(researchMemos)
        .set({
          title: input.title.trim(),
          bodyMd,
          summaryJson: input.summaryJson,
          asOf: input.asOf,
          clientId: input.clientId,
          version: existing[0].version + 1,
          updatedAt: new Date(),
        })
        .where(eq(researchMemos.id, existing[0].id))
        .returning();
      row = updated;
    }
  }

  if (!row) {
    const [inserted] = await db
      .insert(researchMemos)
      .values({
        tickerId: input.tickerId ?? null,
        sessionId: input.sessionId,
        clientId: input.clientId,
        title: input.title.trim(),
        bodyMd,
        summaryJson: input.summaryJson,
        asOf: input.asOf,
        parentMemoId: input.parentMemoId,
        version: 1,
      })
      .returning();
    row = inserted;
  }

  if (!row) throw new Error('Failed to save research memo');

  let sourcesLinked = 0;
  if (opts?.linkSessionSources !== false && input.sessionId) {
    sourcesLinked = await linkResearchSourcesToMemo(db, row.id, {
      sessionId: input.sessionId,
      tickerId: input.tickerId ?? undefined,
    });
  }

  return { id: row.id, version: row.version, sources_linked: sourcesLinked };
}

export async function linkResearchSourcesToMemo(
  db: Db,
  memoId: number,
  opts: { sourceIds?: number[]; sessionId?: string; tickerId?: number },
): Promise<number> {
  if (opts.sourceIds?.length) {
    const updated = await db
      .update(researchSources)
      .set({ memoId })
      .where(inArray(researchSources.id, opts.sourceIds))
      .returning({ id: researchSources.id });
    return updated.length;
  }

  const conditions = [isNull(researchSources.memoId)];
  if (opts.sessionId) conditions.push(eq(researchSources.sessionId, opts.sessionId));
  if (opts.tickerId != null) conditions.push(eq(researchSources.tickerId, opts.tickerId));

  const updated = await db
    .update(researchSources)
    .set({ memoId })
    .where(and(...conditions))
    .returning({ id: researchSources.id });
  return updated.length;
}

export async function getResearchMemo(
  db: Db,
  opts: { id?: number; tickerId?: number; sessionId?: string; includeBody?: boolean },
) {
  if (opts.id) {
    const rows = await db.select().from(researchMemos).where(eq(researchMemos.id, opts.id)).limit(1);
    return rows[0] ?? null;
  }

  const conditions = [];
  if (opts.tickerId != null) conditions.push(eq(researchMemos.tickerId, opts.tickerId));
  if (opts.sessionId) conditions.push(eq(researchMemos.sessionId, opts.sessionId));
  if (conditions.length === 0) return null;

  const rows = await db
    .select()
    .from(researchMemos)
    .where(and(...conditions))
    .orderBy(desc(researchMemos.createdAt))
    .limit(1);

  const row = rows[0] ?? null;
  if (row && opts.includeBody === false) {
    const { bodyMd: _body, ...rest } = row;
    return { ...rest, body_md_length: row.bodyMd.length };
  }
  return row;
}

export async function listResearchMemos(
  db: Db,
  opts?: {
    tickerId?: number;
    sector?: string;
    scope?: string;
    insightType?: string;
    limit?: number;
    includeBody?: boolean;
  },
) {
  const limit = opts?.limit ?? 20;
  const conditions = [];
  if (opts?.tickerId != null) conditions.push(eq(researchMemos.tickerId, opts.tickerId));

  const rows = await db
    .select()
    .from(researchMemos)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(researchMemos.createdAt))
    .limit(limit * 3);

  let filtered = rows;
  if (opts?.sector) {
    const target = opts.sector.toLowerCase();
    filtered = filtered.filter((r) => {
      const sj = r.summaryJson as Record<string, unknown> | null;
      const sec = String(sj?.sector ?? '').toLowerCase();
      const slug = String(sj?.sector_slug ?? '').toLowerCase();
      return sec === target || slug === target || sectorSlug(sec) === target;
    });
  }
  if (opts?.scope) {
    const target = opts.scope.toLowerCase();
    filtered = filtered.filter((r) => {
      const sj = r.summaryJson as Record<string, unknown> | null;
      return String(sj?.scope ?? '').toLowerCase() === target;
    });
  }
  if (opts?.insightType) {
    const target = opts.insightType.toLowerCase();
    filtered = filtered.filter((r) => {
      const sj = r.summaryJson as Record<string, unknown> | null;
      return String(sj?.insight_type ?? '').toLowerCase() === target;
    });
  }

  const sliced = filtered.slice(0, limit);

  if (opts?.includeBody === false) {
    return sliced.map(({ bodyMd, ...rest }) => ({ ...rest, body_md_length: bodyMd.length }));
  }
  return sliced;
}

export async function listSkillOverrides(db: Db) {
  return db.select().from(skillOverrides).orderBy(skillOverrides.slug);
}

export async function getSkillOverride(db: Db, slug: string) {
  const rows = await db.select().from(skillOverrides).where(eq(skillOverrides.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function upsertSkillOverride(
  db: Db,
  input: {
    slug: string;
    skillMd: string;
    toolName?: string;
    name?: string;
    description?: string;
    metadataJson?: Record<string, unknown>;
    isActive?: boolean;
    clientId?: string;
  },
): Promise<typeof skillOverrides.$inferSelect> {
  const skillMd = input.skillMd.trim();
  if (!skillMd) throw new Error('skill_md required');

  const existing = await getSkillOverride(db, input.slug);
  if (existing) {
    const [row] = await db
      .update(skillOverrides)
      .set({
        skillMd,
        toolName: input.toolName ?? existing.toolName,
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        metadataJson: input.metadataJson ?? existing.metadataJson,
        isActive: input.isActive ?? existing.isActive,
        clientId: input.clientId ?? existing.clientId,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(skillOverrides.id, existing.id))
      .returning();
    if (!row) throw new Error('Failed to update skill override');
    return row;
  }

  const [row] = await db
    .insert(skillOverrides)
    .values({
      slug: input.slug,
      skillMd,
      toolName: input.toolName,
      name: input.name,
      description: input.description,
      metadataJson: input.metadataJson,
      isActive: input.isActive ?? true,
      clientId: input.clientId,
      version: 1,
    })
    .returning();
  if (!row) throw new Error('Failed to insert skill override');
  return row;
}

export async function deleteSkillOverride(db: Db, slug: string): Promise<boolean> {
  const deleted = await db
    .delete(skillOverrides)
    .where(eq(skillOverrides.slug, slug))
    .returning({ id: skillOverrides.id });
  return deleted.length > 0;
}

// --- Sector taxonomy & snapshots ---

export async function seedCanonicalSectors(db: Db): Promise<number> {
  let upserted = 0;
  for (const s of CANONICAL_SECTORS) {
    const existing = await db.select().from(sectors).where(eq(sectors.slug, s.slug)).limit(1);
    if (existing[0]) {
      await db
        .update(sectors)
        .set({
          displayName: s.displayName,
          dseGroup: s.dseGroup ?? s.displayName,
          aliases: s.aliases,
        })
        .where(eq(sectors.slug, s.slug));
    } else {
      await db.insert(sectors).values({
        slug: s.slug,
        displayName: s.displayName,
        dseGroup: s.dseGroup ?? s.displayName,
        aliases: s.aliases,
      });
    }
    upserted++;
  }
  return upserted;
}

export async function listCanonicalSectors(db: Db) {
  const rows = await db.select().from(sectors).orderBy(sectors.displayName);
  if (rows.length > 0) return rows;
  return CANONICAL_SECTORS.map((s) => ({
    id: 0,
    slug: s.slug,
    displayName: s.displayName,
    dseGroup: s.dseGroup ?? s.displayName,
    aliases: s.aliases,
    createdAt: new Date(),
  }));
}

export type SectorMetricsRow = {
  sector_slug: string;
  sector_display: string;
  ticker_count: number;
  median_roc_1m_pct: number | null;
  median_roc_3m_pct: number | null;
  avg_pe: number | null;
  top_performer: string | null;
  top_roc_1m_pct: number | null;
  bottom_performer: string | null;
  bottom_roc_1m_pct: number | null;
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
  return Math.round(value * 100) / 100;
}

export async function aggregateSectorMetrics(db: Db, lookback1m = 21, lookback3m = 63): Promise<SectorMetricsRow[]> {
  const past1Rn = lookback1m + 1;
  const past3Rn = lookback3m + 1;

  type ReturnRow = {
    id: number;
    symbol: string;
    sector: string;
    roc_1m: number | null;
    roc_3m: number | null;
  };

  const returns = rowsFromExecute<ReturnRow>(
    db.all(sql`
      WITH ranked AS (
        SELECT ticker_id, close,
          ROW_NUMBER() OVER (PARTITION BY ticker_id ORDER BY trade_date DESC) AS rn
        FROM ohlcv_daily
      )
      SELECT t.id, t.symbol, t.sector,
        CASE WHEN past1.close > 0
          THEN ROUND(((last.close - past1.close) / past1.close * 100), 2)
          ELSE NULL END AS roc_1m,
        CASE WHEN past3.close > 0
          THEN ROUND(((last.close - past3.close) / past3.close * 100), 2)
          ELSE NULL END AS roc_3m
      FROM tickers t
      JOIN ranked last ON last.ticker_id = t.id AND last.rn = 1
      JOIN ranked past1 ON past1.ticker_id = t.id AND past1.rn = ${past1Rn}
      JOIN ranked past3 ON past3.ticker_id = t.id AND past3.rn = ${past3Rn}
      WHERE t.is_active = 1 AND t.sector IS NOT NULL
    `),
  );

  type PeRow = { ticker_id: number; pe_ratio: number | null };
  const peRows = rowsFromExecute<PeRow>(
    db.all(sql`
      SELECT f.ticker_id,
        CAST(json_extract(f.payload, '$.pe_ratio') AS REAL) AS pe_ratio
      FROM fundamentals_snapshots f
      INNER JOIN (
        SELECT ticker_id, MAX(as_of) AS max_as_of
        FROM fundamentals_snapshots
        GROUP BY ticker_id
      ) latest ON f.ticker_id = latest.ticker_id AND f.as_of = latest.max_as_of
    `),
  );
  const peByTicker = new Map(peRows.map((r) => [r.ticker_id, r.pe_ratio]));

  type Bucket = {
    display: string;
    rows: ReturnRow[];
    peValues: number[];
  };
  const bySector = new Map<string, Bucket>();

  for (const row of returns) {
    if (row.roc_1m == null || row.roc_3m == null) continue;
    const display = row.sector || 'Unknown';
    let bucket = bySector.get(display);
    if (!bucket) {
      bucket = { display, rows: [], peValues: [] };
      bySector.set(display, bucket);
    }
    bucket.rows.push(row);
    const pe = peByTicker.get(row.id);
    if (pe != null && Number.isFinite(pe)) bucket.peValues.push(pe);
  }

  const out: SectorMetricsRow[] = [];
  for (const bucket of bySector.values()) {
    const roc1 = bucket.rows.map((r) => r.roc_1m!).filter((n) => Number.isFinite(n));
    const roc3 = bucket.rows.map((r) => r.roc_3m!).filter((n) => Number.isFinite(n));
    const top = [...bucket.rows].sort((a, b) => (b.roc_1m ?? -Infinity) - (a.roc_1m ?? -Infinity))[0];
    const bottom = [...bucket.rows].sort((a, b) => (a.roc_1m ?? Infinity) - (b.roc_1m ?? Infinity))[0];
    const avgPe =
      bucket.peValues.length > 0
        ? Math.round((bucket.peValues.reduce((a, b) => a + b, 0) / bucket.peValues.length) * 100) / 100
        : null;

    out.push({
      sector_slug: sectorSlug(bucket.display) ?? bucket.display.toLowerCase().replace(/\s+/g, '-'),
      sector_display: normalizeSector(bucket.display) ?? bucket.display,
      ticker_count: bucket.rows.length,
      median_roc_1m_pct: median(roc1),
      median_roc_3m_pct: median(roc3),
      avg_pe: avgPe,
      top_performer: top?.symbol ?? null,
      top_roc_1m_pct: top?.roc_1m ?? null,
      bottom_performer: bottom?.symbol ?? null,
      bottom_roc_1m_pct: bottom?.roc_1m ?? null,
    });
  }

  out.sort((a, b) => (b.median_roc_1m_pct ?? -Infinity) - (a.median_roc_1m_pct ?? -Infinity));
  return out;
}

export async function upsertSectorSnapshot(
  db: Db,
  sectorSlug: string,
  asOf: string,
  metricsJson: Record<string, unknown>,
  newsSummaryJson: Record<string, unknown> | null,
  source: string,
) {
  const existing = await db
    .select()
    .from(sectorSnapshots)
    .where(and(eq(sectorSnapshots.sectorSlug, sectorSlug), eq(sectorSnapshots.asOf, asOf)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(sectorSnapshots)
      .set({ metricsJson, newsSummaryJson, source, ingestedAt: new Date() })
      .where(eq(sectorSnapshots.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(sectorSnapshots)
    .values({ sectorSlug, asOf, metricsJson, newsSummaryJson, source })
    .returning({ id: sectorSnapshots.id });
  return row?.id;
}

export async function getLatestSectorSnapshots(db: Db, asOf?: string) {
  if (asOf) {
    return db
      .select()
      .from(sectorSnapshots)
      .where(eq(sectorSnapshots.asOf, asOf))
      .orderBy(sectorSnapshots.sectorSlug);
  }

  const latest = await db
    .select({ asOf: sectorSnapshots.asOf })
    .from(sectorSnapshots)
    .orderBy(desc(sectorSnapshots.asOf))
    .limit(1);
  const latestDate = latest[0]?.asOf;
  if (!latestDate) return [];

  return db
    .select()
    .from(sectorSnapshots)
    .where(eq(sectorSnapshots.asOf, latestDate))
    .orderBy(sectorSnapshots.sectorSlug);
}

export async function getSectorSnapshot(db: Db, sectorSlug: string) {
  const rows = await db
    .select()
    .from(sectorSnapshots)
    .where(eq(sectorSnapshots.sectorSlug, sectorSlug))
    .orderBy(desc(sectorSnapshots.asOf))
    .limit(1);
  return rows[0] ?? null;
}

export async function retagSectorNews(db: Db, limit = 2000): Promise<number> {
  const { detectSectorFromHeadline } = await import('@stock-buddy/core');
  const rows = await db
    .select({ id: newsItems.id, headline: newsItems.headline, sectorTag: newsItems.sectorTag })
    .from(newsItems)
    .where(isNull(newsItems.sectorTag))
    .orderBy(desc(newsItems.publishedDate))
    .limit(limit);

  let updated = 0;
  for (const row of rows) {
    const slug = detectSectorFromHeadline(row.headline);
    if (!slug) continue;
    const hit = await db
      .update(newsItems)
      .set({ sectorTag: slug })
      .where(eq(newsItems.id, row.id))
      .returning({ id: newsItems.id });
    updated += hit.length;
  }
  return updated;
}

export async function getSectorNews(db: Db, sectorDisplay: string, days = 7, limit = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const slug = sectorSlug(sectorDisplay);
  const normalized = normalizeSector(sectorDisplay);

  const sectorTickers = await db
    .select({ id: tickers.id, sector: tickers.sector })
    .from(tickers)
    .where(eq(tickers.isActive, true));

  const tickerIds = sectorTickers
    .filter((t) => normalizeSector(t.sector) === normalized || t.sector === sectorDisplay)
    .map((t) => t.id);

  const byTicker =
    tickerIds.length > 0
      ? await db
          .select({
            id: newsItems.id,
            headline: newsItems.headline,
            publishedDate: newsItems.publishedDate,
            source: newsItems.source,
            category: newsItems.category,
            url: newsItems.url,
            tickerId: newsItems.tickerId,
          })
          .from(newsItems)
          .where(and(inArray(newsItems.tickerId, tickerIds), gte(newsItems.publishedDate, cutoffStr)))
          .orderBy(desc(newsItems.publishedDate))
          .limit(limit)
      : [];

  const byTag = slug
    ? await db
        .select({
          id: newsItems.id,
          headline: newsItems.headline,
          publishedDate: newsItems.publishedDate,
          source: newsItems.source,
          category: newsItems.category,
          url: newsItems.url,
          tickerId: newsItems.tickerId,
        })
        .from(newsItems)
        .where(and(eq(newsItems.sectorTag, slug), gte(newsItems.publishedDate, cutoffStr)))
        .orderBy(desc(newsItems.publishedDate))
        .limit(limit)
    : [];

  const seen = new Set<number>();
  const merged = [...byTicker, ...byTag].filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  merged.sort((a, b) => String(b.publishedDate).localeCompare(String(a.publishedDate)));
  return merged.slice(0, limit);
}

export async function countSectorNews(db: Db, sectorDisplay: string, days = 7): Promise<number> {
  const rows = await getSectorNews(db, sectorDisplay, days, 500);
  return rows.length;
}
