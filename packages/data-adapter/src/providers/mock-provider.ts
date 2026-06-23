import {
  BaseDataProvider,
  type FundamentalsRecord,
  type MarketDataRecord,
  type NewsItem,
  type OhlcvRecord,
  type SectorDataRecord,
} from '../interface.js';

export class MockProvider extends BaseDataProvider {
  async getOhlcv(
    _ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<OhlcvRecord[]> {
    const ohlcv: OhlcvRecord[] = [];
    let current = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    let price = 100.0;

    while (current <= end) {
      if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) {
        ohlcv.push({
          date: formatIsoDate(current),
          open: price,
          high: price * 1.02,
          low: price * 0.98,
          close: price * 1.01,
          volume: 1_000_000,
        });
        price *= 1.01;
      }

      current = addDays(current, 1);
    }

    return ohlcv;
  }

  async getFundamentals(ticker: string): Promise<FundamentalsRecord> {
    return {
      ticker,
      market_cap: 1_000_000_000,
      pe_ratio: 15.0,
      eps: 10.0,
      dividend_yield: 0.03,
      book_value: 100.0,
      debt_to_equity: 0.5,
      roe: 0.15,
      revenue: 500_000_000,
      profit_margin: 0.1,
      mock: true,
    };
  }

  async getMarketData(targetDate: string): Promise<MarketDataRecord> {
    return {
      dse_index: 5500.0,
      dse30_index: 2100.0,
      total_volume: 1_000_000_000,
      total_trades: 50_000,
      total_value: 5_000_000_000,
      advances: 150,
      declines: 100,
      unchanged: 50,
      date: targetDate,
      mock: true,
    };
  }

  async getSectorData(sector: string, targetDate: string): Promise<SectorDataRecord> {
    return {
      sector,
      index: 1500.0,
      change_pct: 1.5,
      volume: 500_000_000,
      trades: 10_000,
      date: targetDate,
      top_gainers: [
        { ticker: 'MOCK1', change_pct: 5.0 },
        { ticker: 'MOCK2', change_pct: 3.0 },
      ],
      top_losers: [
        { ticker: 'MOCK3', change_pct: -4.0 },
        { ticker: 'MOCK4', change_pct: -2.0 },
      ],
      mock: true,
    };
  }

  async getNews(
    ticker?: string,
    _startDate?: string,
    _endDate?: string,
    limit = 10,
  ): Promise<NewsItem[]> {
    const news: NewsItem[] = [];

    for (let i = 0; i < Math.min(limit, 5); i += 1) {
      news.push({
        date: new Date().toISOString().slice(0, 10),
        ticker: ticker ?? `MOCK${i}`,
        headline: `Mock news item ${i + 1}`,
        source: 'Mock Source',
        category: 'test',
        mock: true,
      });
    }

    return news;
  }
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
