import type { OhlcvBar } from '@stock-buddy/core';

export type ProviderConfig = Record<string, unknown> & {
  fixtures_path?: string;
  api_url?: string;
  api_key?: string;
  rate_limit?: number;
  rate_period?: number;
};

export type OhlcvRecord = OhlcvBar;

export interface NewsItem {
  date: string;
  ticker?: string;
  headline?: string;
  source?: string;
  category?: string;
  url?: string;
  [key: string]: unknown;
}

export interface FundamentalsRecord {
  market_cap?: number;
  pe_ratio?: number;
  eps?: number;
  dividend_yield?: number;
  book_value?: number;
  debt_to_equity?: number;
  roe?: number;
  revenue?: number;
  profit_margin?: number;
  [key: string]: unknown;
}

export interface MarketDataRecord {
  dse_index?: number;
  dse30_index?: number;
  total_volume?: number;
  total_trades?: number;
  total_value?: number;
  advances?: number;
  declines?: number;
  unchanged?: number;
  date?: string;
  [key: string]: unknown;
}

export interface SectorDataRecord {
  sector?: string;
  index?: number;
  change_pct?: number;
  volume?: number;
  trades?: number;
  date?: string;
  top_gainers?: Array<{ ticker: string; change_pct: number }>;
  top_losers?: Array<{ ticker: string; change_pct: number }>;
  [key: string]: unknown;
}

export interface HealthStatus {
  provider: string;
  status: string;
  timestamp: string;
  message?: string;
  [key: string]: unknown;
}

export type ProviderCapabilities = Record<string, boolean | string | number | Record<string, unknown>>;

export interface DataProvider {
  getOhlcv(ticker: string, startDate: string, endDate: string): Promise<OhlcvRecord[]>;
  getFundamentals(ticker: string): Promise<FundamentalsRecord>;
  getMarketData(targetDate: string): Promise<MarketDataRecord>;
  getSectorData(sector: string, targetDate: string): Promise<SectorDataRecord>;
  getNews(
    ticker?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
  ): Promise<NewsItem[]>;
  healthCheck(): Promise<HealthStatus>;
  getCapabilities(): ProviderCapabilities;
}

export abstract class BaseDataProvider implements DataProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig = {}) {
    this.config = config;
  }

  abstract getOhlcv(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<OhlcvRecord[]>;

  abstract getFundamentals(ticker: string): Promise<FundamentalsRecord>;

  abstract getMarketData(targetDate: string): Promise<MarketDataRecord>;

  abstract getSectorData(sector: string, targetDate: string): Promise<SectorDataRecord>;

  abstract getNews(
    ticker?: string,
    startDate?: string,
    endDate?: string,
    limit?: number,
  ): Promise<NewsItem[]>;

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: this.constructor.name,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      realtime: false,
      historical: true,
      fundamentals: true,
      news: true,
      sectors: true,
    };
  }
}
