import {
  getLatestFundamentals,
  getOhlcv,
  listTickers,
  type Db,
} from '@stock-buddy/db';

export async function buildUniverse(
  db: Db,
  opts?: { sector?: string; commodityType?: string; limit?: number },
): Promise<Record<string, unknown>[]> {
  const all = await listTickers(db);
  let filtered = all;
  if (opts?.sector) {
    filtered = filtered.filter((t) => t.sector?.toLowerCase() === opts.sector!.toLowerCase());
  }
  if (opts?.commodityType) {
    filtered = filtered.filter((t) => t.commodityType?.toLowerCase() === opts.commodityType!.toLowerCase());
  }
  const cap = opts?.limit ?? 200;
  const universe: Record<string, unknown>[] = [];

  for (const t of filtered.slice(0, cap)) {
    const ohlcvRows = await getOhlcv(db, t.id, { limit: 260 });
    if (ohlcvRows.length < 30) continue;
    const ohlcv = ohlcvRows.map((r) => ({
      date: r.tradeDate,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
    const fundSnap = await getLatestFundamentals(db, t.id);
    const fundamentals = fundSnap ? (fundSnap.payload as Record<string, unknown>) : {};
    universe.push({
      ticker: t.symbol,
      sector: t.sector,
      commodity_type: t.commodityType,
      ohlcv,
      fundamentals,
    });
  }
  return universe;
}
