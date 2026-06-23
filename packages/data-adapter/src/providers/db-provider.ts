import {
  BaseDataProvider,
  type FundamentalsRecord,
  type HealthStatus,
  type MarketDataRecord,
  type NewsItem,
  type OhlcvRecord,
  type ProviderCapabilities,
  type SectorDataRecord,
} from '../interface.js';
import { createDb, closeDb, getOhlcv, getLatestFundamentals, getTickerBySymbol } from '@stock-buddy/db';

export class DbProvider extends BaseDataProvider {
  async getOhlcv(ticker: string, startDate: string, endDate: string): Promise<OhlcvRecord[]> {
    const db = createDb();
    try {
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return [];
      const rows = await getOhlcv(db, t.id, { start: startDate, end: endDate });
      return rows.map((r) => ({
        date: String(r.tradeDate),
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
    } finally {
      await closeDb(db);
    }
  }

  async getFundamentals(ticker: string): Promise<FundamentalsRecord> {
    const db = createDb();
    try {
      const t = await getTickerBySymbol(db, ticker);
      if (!t) return { ticker, data_source: 'db' };
      const snap = await getLatestFundamentals(db, t.id);
      if (!snap) return { ticker, data_source: 'db' };
      return {
        ticker,
        ...(snap.payload as FundamentalsRecord),
        data_source: snap.source,
        last_updated: snap.ingestedAt.toISOString(),
      };
    } finally {
      await closeDb(db);
    }
  }

  async getMarketData(_targetDate: string): Promise<MarketDataRecord> {
    return { data_source: 'db' };
  }

  async getSectorData(sector: string, _targetDate: string): Promise<SectorDataRecord> {
    return { sector, data_source: 'db' };
  }

  async getNews(ticker?: string, _startDate?: string, _endDate?: string, _limit = 10): Promise<NewsItem[]> {
    void ticker;
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const db = createDb();
      try {
        await getTickerBySymbol(db, 'GP');
      } finally {
        await closeDb(db);
      }
      return {
        provider: 'DbProvider',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return {
        provider: 'DbProvider',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        message: String(e),
      };
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      realtime: false,
      historical: true,
      fundamentals: true,
      news: true,
      sectors: false,
      production_ready: true,
    };
  }
}
