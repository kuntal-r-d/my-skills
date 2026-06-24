import {
  getDefaultAccount,
  getLatestAnalysisSnapshot,
  getLatestMacro,
  getNews,
  getOhlcv,
  getPortfolioPositions,
  listWatchlist,
  type Db,
} from '@stock-buddy/db';
import { runSkill } from '@stock-buddy/mcp-server/composites';

export async function runDailyBriefing(db: Db): Promise<Record<string, unknown>> {
  const asOf = new Date().toISOString().slice(0, 10);
  const account = await getDefaultAccount(db);
  const macroSnap = await getLatestMacro(db);
  const macro = macroSnap ? (macroSnap.payload as Record<string, unknown>) : undefined;

  const positions: Record<string, unknown>[] = [];
  if (account) {
    const rows = await getPortfolioPositions(db, account.id);
    for (const { position, symbol } of rows) {
      const ohlcv = await getOhlcv(db, position.tickerId, { limit: 1 });
      const last = ohlcv[ohlcv.length - 1];
      positions.push({
        ticker: symbol,
        qty: position.qty,
        avg_cost: position.avgCost,
        current_price: last?.close,
        stop_level: position.stopLevel,
        target_level: position.targetLevel,
        sector: position.sector,
      });
    }
  }

  const watchRows = await listWatchlist(db);
  const watch: Record<string, unknown>[] = [];
  for (const w of watchRows) {
    const snap = await getLatestAnalysisSnapshot(db, w.tickerId);
    watch.push({
      ticker: w.symbol,
      purpose: w.purpose,
      investment_score: snap?.payload
        ? (snap.payload as Record<string, unknown>).synthesis
          ? ((snap.payload as Record<string, unknown>).synthesis as Record<string, unknown>).investment
          : undefined
        : undefined,
    });
  }

  const newsRows = await getNews(db, undefined, 3);
  const news = newsRows.map((n) => ({
    date: n.publishedDate,
    headline: n.headline,
    ticker: null,
    source: n.source,
  }));

  return runSkill('daily_briefing', {
    as_of: asOf,
    user: account?.label,
    macro,
    portfolio: { positions },
    watchlist: watch,
    news,
    calendar: [],
  });
}
