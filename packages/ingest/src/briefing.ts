import {
  extractAnalysisScores,
  getDefaultAccount,
  getLatestAnalysisSnapshot,
  getLatestMacro,
  getOhlcv,
  getPortfolioPositions,
  listImportantNews,
  listWatchlist,
  type Db,
} from '@stock-buddy/db';
import { runSkill } from '@stock-buddy/mcp-server/composites';

function riskLevels(payload: Record<string, unknown> | undefined) {
  const risk = payload?.risk as Record<string, unknown> | undefined;
  const km = risk?.key_metrics as Record<string, unknown> | undefined;
  return {
    stop: km?.stop_loss as number | undefined,
    target: km?.target as number | undefined,
    entry: (km?.buy_zone_low ?? km?.buy_zone_high) as number | undefined,
  };
}

function assessMacroRegime(
  macroRaw: Record<string, unknown> | undefined,
  asOf: string,
): Record<string, unknown> | undefined {
  if (!macroRaw) return undefined;
  const assessed = runSkill('macro_regime', { macro: macroRaw, as_of: asOf });
  if ('error' in assessed) return undefined;
  const km = assessed.key_metrics as Record<string, unknown> | undefined;
  return {
    rating: assessed.rating,
    risk_multiplier: km?.risk_multiplier,
    score: assessed.score,
    confidence: assessed.confidence,
    reasoning: assessed.reasoning,
    flags: assessed.flags,
  };
}

export async function runDailyBriefing(db: Db): Promise<Record<string, unknown>> {
  const asOf = new Date().toISOString().slice(0, 10);
  const account = await getDefaultAccount(db);
  const macroSnap = await getLatestMacro(db);
  const macroRaw = macroSnap?.payload as Record<string, unknown> | undefined;
  const macroRegime = assessMacroRegime(macroRaw, asOf);

  const positions: Record<string, unknown>[] = [];
  if (account) {
    const rows = await getPortfolioPositions(db, account.id);
    for (const { position, symbol } of rows) {
      const ohlcv = await getOhlcv(db, position.tickerId, { limit: 1 });
      const last = ohlcv[ohlcv.length - 1];
      const snap = await getLatestAnalysisSnapshot(db, position.tickerId);
      const payload = snap?.payload as Record<string, unknown> | undefined;
      const scores = extractAnalysisScores(payload);
      const levels = riskLevels(payload);
      positions.push({
        ticker: symbol,
        purpose: position.purpose,
        qty: position.qty,
        avg_cost: position.avgCost,
        current_price: last?.close,
        stop_level: position.stopLevel ?? levels.stop,
        target_level: position.targetLevel ?? levels.target,
        sector: position.sector,
        investment_rating: scores.investment_rating,
        momentum_rating: scores.momentum_rating,
        investment_score: scores.investment_score,
        momentum_score: scores.momentum_score,
        risk_rating: scores.risk_rating,
      });
    }
  }

  const watchRows = await listWatchlist(db);
  const watch: Record<string, unknown>[] = [];
  for (const w of watchRows) {
    const ohlcv = await getOhlcv(db, w.tickerId, { limit: 1 });
    const last = ohlcv[ohlcv.length - 1];
    const snap = await getLatestAnalysisSnapshot(db, w.tickerId);
    const payload = snap?.payload as Record<string, unknown> | undefined;
    const scores = extractAnalysisScores(payload);
    const levels = riskLevels(payload);
    watch.push({
      ticker: w.symbol,
      purpose: w.purpose,
      sector: w.sector,
      current_price: last?.close,
      entry_level: levels.entry,
      signal: scores.investment_rating ?? scores.momentum_rating,
      investment_rating: scores.investment_rating,
      momentum_rating: scores.momentum_rating,
      investment_score: scores.investment_score,
      momentum_score: scores.momentum_score,
    });
  }

  const newsRows = await listImportantNews(db, 15, 7);
  const overnightNews = newsRows.map((n) => ({
    date: n.publishedDate,
    headline: n.headline,
    ticker: n.symbol,
    source: n.source,
    importance: n.importance,
  }));

  return runSkill('daily_briefing', {
    as_of: asOf,
    user: account?.label,
    macro_regime: macroRegime,
    portfolio: { positions },
    watchlist: watch,
    overnight_news: overnightNews,
    calendar: [],
  });
}
