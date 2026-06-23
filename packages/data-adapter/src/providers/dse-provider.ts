import {
  BaseDataProvider,
  type FundamentalsRecord,
  type HealthStatus,
  type MarketDataRecord,
  type NewsItem,
  type OhlcvRecord,
  type ProviderCapabilities,
  type ProviderConfig,
  type SectorDataRecord,
} from '../interface.js';

export class DSEProvider extends BaseDataProvider {
  private readonly apiUrl: string;
  private readonly apiKey?: string;

  constructor(config: ProviderConfig = {}) {
    super(config);
    this.apiUrl =
      typeof config.api_url === 'string' ? config.api_url : 'https://api.dse.com.bd';
    this.apiKey = typeof config.api_key === 'string' ? config.api_key : undefined;
  }

  async getOhlcv(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<OhlcvRecord[]> {
    void this.apiUrl;
    void this.apiKey;
    console.log(`DSEProvider: Would fetch OHLCV for ${ticker} from ${startDate} to ${endDate}`);
    return [];
  }

  async getFundamentals(ticker: string): Promise<FundamentalsRecord> {
    console.log(`DSEProvider: Would fetch fundamentals for ${ticker}`);

    return {
      ticker,
      market_cap: 0,
      pe_ratio: 0,
      eps: 0,
      dividend_yield: 0,
      book_value: 0,
      debt_to_equity: 0,
      roe: 0,
      revenue: 0,
      profit_margin: 0,
      data_source: 'DSE',
      last_updated: new Date().toISOString(),
    };
  }

  async getMarketData(targetDate: string): Promise<MarketDataRecord> {
    console.log(`DSEProvider: Would fetch market data for ${targetDate}`);

    return {
      dse_index: 0,
      dse30_index: 0,
      total_volume: 0,
      total_trades: 0,
      total_value: 0,
      advances: 0,
      declines: 0,
      unchanged: 0,
      date: targetDate,
      data_source: 'DSE',
    };
  }

  async getSectorData(sector: string, targetDate: string): Promise<SectorDataRecord> {
    console.log(`DSEProvider: Would fetch sector data for ${sector} on ${targetDate}`);

    return {
      sector,
      index: 0,
      change_pct: 0,
      volume: 0,
      trades: 0,
      date: targetDate,
      top_gainers: [],
      top_losers: [],
      data_source: 'DSE',
    };
  }

  async getNews(
    ticker?: string,
    _startDate?: string,
    _endDate?: string,
    _limit = 10,
  ): Promise<NewsItem[]> {
    console.log(`DSEProvider: Would fetch news for ${ticker ?? 'all'}`);
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      provider: 'DSEProvider',
      status: 'not_implemented',
      timestamp: new Date().toISOString(),
      message: 'DSE provider is a stub - not connected to real API',
    };
  }

  getCapabilities(): ProviderCapabilities {
    return {
      realtime: true,
      historical: true,
      fundamentals: true,
      news: true,
      sectors: true,
      production_ready: false,
    };
  }
}
