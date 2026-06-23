import type { Db } from '@stock-buddy/db';
import {
  addToWatchlist,
  ensureTicker,
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
  removePosition,
  setAccount,
  upsertPosition,
} from '@stock-buddy/db';
import {
  buildTickerContract,
  stripMeta,
  ingestAll,
  ingestOhlcv,
} from '@stock-buddy/ingest';

function isAdmin(): boolean {
  return process.env.STOCK_BUDDY_DATA_ADMIN === '1';
}

export async function handleDataTool(
  db: Db,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'get_ticker_contract': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      if (!ticker) return { error: 'ticker required' };
      const contract = await buildTickerContract(db, ticker, {
        mode: (args.mode as 'momentum' | 'investment') ?? 'investment',
        ohlcvDays: args.ohlcv_days ? Number(args.ohlcv_days) : 260,
        includePortfolio: Boolean(args.include_portfolio),
      });
      return contract;
    }

    case 'get_ticker_contract_for_analysis': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      if (!ticker) return { error: 'ticker required' };
      const contract = await buildTickerContract(db, ticker, {
        mode: (args.mode as 'momentum' | 'investment') ?? 'investment',
        ohlcvDays: args.ohlcv_days ? Number(args.ohlcv_days) : 260,
        includePortfolio: Boolean(args.include_portfolio),
      });
      return stripMeta(contract);
    }

    case 'get_ohlcv': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { error: `Unknown ticker: ${ticker}` };
      const rows = await getOhlcv(db, t.id, {
        start: args.start ? String(args.start) : undefined,
        end: args.end ? String(args.end) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });
      return {
        ticker,
        ohlcv: rows.map((r) => ({
          date: r.tradeDate,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: r.volume,
        })),
      };
    }

    case 'get_fundamentals': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { error: `Unknown ticker: ${ticker}` };
      const snap = await getLatestFundamentals(db, t.id);
      return { ticker, fundamentals: snap?.payload ?? null, as_of: snap?.asOf, source: snap?.source };
    }

    case 'get_shareholding': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const months = args.months ? Number(args.months) : 4;
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { error: `Unknown ticker: ${ticker}` };
      const rows = await getShareholding(db, t.id, months);
      return {
        ticker,
        shareholding: rows.map((r) => ({
          month: String(r.month).slice(0, 7),
          sponsor: r.sponsor,
          govt: r.govt,
          institution: r.institution,
          foreign: r.foreign,
          public: r.public,
        })),
      };
    }

    case 'get_macro': {
      const snap = await getLatestMacro(db);
      return { macro: snap?.payload ?? null, as_of: snap?.asOf, source: snap?.source };
    }

    case 'get_news': {
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      const days = args.days ? Number(args.days) : 7;
      let tickerId: number | undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
      }
      const rows = await getNews(db, tickerId, days);
      return {
        news: rows.map((n) => ({
          date: n.publishedDate,
          headline: n.headline,
          source: n.source,
          category: n.category,
        })),
      };
    }

    case 'get_data_status': {
      const ticker = args.ticker ? String(args.ticker).toUpperCase() : undefined;
      let tickerId: number | undefined;
      if (ticker) {
        const t = await getTickerBySymbol(db, ticker);
        if (!t) return { error: `Unknown ticker: ${ticker}` };
        tickerId = t.id;
      }
      const rows = await getFreshness(db, tickerId);
      return {
        freshness: rows.map((f) => ({
          entity_type: f.entityType,
          last_success_at: f.lastSuccessAt,
          last_attempt_at: f.lastAttemptAt,
          stale_after_hours: f.staleAfterHours,
        })),
      };
    }

    case 'list_tickers': {
      const rows = await listTickers(db);
      return { tickers: rows.map((t) => ({ symbol: t.symbol, name: t.name, sector: t.sector })) };
    }

    case 'get_portfolio': {
      const account = await getDefaultAccount(db);
      if (!account) return { error: 'No portfolio account configured' };
      const positions = await getPortfolioPositions(db, account.id);
      const totalValue = positions.reduce((s, p) => s + p.position.qty * p.position.avgCost, 0);
      return {
        account: {
          capital_bdt: account.capitalBdt,
          risk_per_trade_pct: account.riskPerTradePct,
          label: account.label,
        },
        portfolio: {
          total_value_bdt: totalValue || account.capitalBdt,
          positions: positions.map((p) => ({
            ticker: p.symbol,
            qty: p.position.qty,
            price: p.position.avgCost,
            sector: p.position.sector,
            stop_level: p.position.stopLevel,
            target_level: p.position.targetLevel,
          })),
        },
      };
    }

    case 'upsert_position': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const qty = Number(args.qty);
      const avgCost = Number(args.avg_cost ?? args.price);
      if (!ticker || Number.isNaN(qty) || Number.isNaN(avgCost)) {
        return { error: 'ticker, qty, and avg_cost required' };
      }
      const account = await getDefaultAccount(db);
      if (!account) return { error: 'No portfolio account' };
      const t = await ensureTicker(db, ticker, { sector: args.sector ? String(args.sector) : undefined });
      await upsertPosition(db, account.id, t.id, {
        qty,
        avgCost,
        sector: args.sector ? String(args.sector) : t.sector ?? undefined,
        stopLevel: args.stop_level != null ? Number(args.stop_level) : undefined,
        targetLevel: args.target_level != null ? Number(args.target_level) : undefined,
      });
      return { ok: true, ticker, qty, avg_cost: avgCost };
    }

    case 'remove_position': {
      const ticker = String(args.ticker ?? '').toUpperCase();
      const account = await getDefaultAccount(db);
      const t = await getTickerBySymbol(db, ticker);
      if (!account || !t) return { error: 'Account or ticker not found' };
      await removePosition(db, account.id, t.id);
      return { ok: true, removed: ticker };
    }

    case 'set_account': {
      const account = await getDefaultAccount(db);
      if (!account) return { error: 'No portfolio account' };
      await setAccount(db, account.id, {
        capitalBdt: args.capital_bdt != null ? Number(args.capital_bdt) : undefined,
        riskPerTradePct: args.risk_per_trade_pct != null ? Number(args.risk_per_trade_pct) : undefined,
        label: args.label != null ? String(args.label) : undefined,
      });
      return { ok: true };
    }

    case 'trigger_ingest': {
      if (!isAdmin()) return { error: 'Admin tools disabled. Set STOCK_BUDDY_DATA_ADMIN=1' };
      const ticker = String(args.ticker ?? '').toUpperCase();
      const job = String(args.job ?? 'all');
      const days = args.days ? Number(args.days) : 365;
      if (job === 'ohlcv') {
        const n = await ingestOhlcv(db, ticker, days);
        return { ok: true, rows: n };
      }
      await ingestAll(db, ticker, days);
      return { ok: true, ticker, job };
    }

    case 'register_ticker': {
      if (!isAdmin()) return { error: 'Admin tools disabled. Set STOCK_BUDDY_DATA_ADMIN=1' };
      const ticker = String(args.ticker ?? '').toUpperCase();
      const t = await ensureTicker(db, ticker, {
        name: args.name ? String(args.name) : undefined,
        sector: args.sector ? String(args.sector) : undefined,
      });
      await addToWatchlist(db, t.id);
      return { ok: true, symbol: t.symbol };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export const DATA_TOOLS = [
  {
    name: 'get_ticker_contract',
    description: 'Full analysis-ready data contract for a DSE ticker (includes _meta freshness).',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        mode: { type: 'string', enum: ['investment', 'momentum'] },
        include_portfolio: { type: 'boolean' },
        ohlcv_days: { type: 'number' },
      },
      required: ['ticker'],
    },
  },
  {
    name: 'get_ticker_contract_for_analysis',
    description: 'Same as get_ticker_contract but strips _meta for analyze_ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        mode: { type: 'string' },
        include_portfolio: { type: 'boolean' },
        ohlcv_days: { type: 'number' },
      },
      required: ['ticker'],
    },
  },
  { name: 'get_ohlcv', description: 'Daily OHLCV bars from database.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_fundamentals', description: 'Latest fundamentals snapshot.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_shareholding', description: 'Monthly shareholding pattern.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_macro', description: 'Latest Bangladesh macro snapshot.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_news', description: 'Recent news items.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'get_data_status', description: 'Data freshness per entity.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'list_tickers', description: 'List tickers in database.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_portfolio', description: 'Your portfolio holdings and account settings.', inputSchema: { type: 'object', properties: {} } },
  { name: 'upsert_position', description: 'Add or update a portfolio position (manual).', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'remove_position', description: 'Remove a portfolio position.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'set_account', description: 'Update capital and risk settings.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'trigger_ingest', description: 'Admin: refresh data for a ticker.', inputSchema: { type: 'object', additionalProperties: true } },
  { name: 'register_ticker', description: 'Admin: add ticker to watchlist.', inputSchema: { type: 'object', additionalProperties: true } },
] as const;
