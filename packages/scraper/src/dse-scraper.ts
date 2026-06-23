import { join } from 'node:path';
import {
  ensureDir,
  fetchText,
  formatDate,
  parseHistoricalCsv,
  readJsonCache,
  sleep,
  writeJsonCache,
  type OhlcvRow,
} from './utils.js';

export interface LatestPrice {
  ticker: string;
  last_price?: number;
  change?: number;
  volume?: number;
  high?: number;
  low?: number;
}

export class DSEScraper {
  readonly cacheDir: string;
  readonly baseUrl = 'https://www.dsebd.org';

  constructor(cacheDir = 'data/cache') {
    this.cacheDir = cacheDir;
    ensureDir(cacheDir);
  }

  async getLatestPrice(ticker: string): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/php_graph/market_price.php`;
      const data = await fetchText(url);
      if (data) {
        return this.parseDseCurrent(data, ticker);
      }
    } catch (e) {
      console.error('DSE API error:', e);
    }

    try {
      const url = `${this.baseUrl}/latest_share_price_scroll_l.php`;
      const data = await fetchText(url);
      if (data) {
        return this.parsePriceTable(data, ticker);
      }
    } catch (e) {
      console.error('Alternative endpoint error:', e);
    }

    return {};
  }

  async getHistoricalData(ticker: string, days = 365): Promise<OhlcvRow[]> {
    const cacheFile = join(this.cacheDir, `${ticker}_history.json`);
    const cached = readJsonCache<OhlcvRow[]>(cacheFile, 3600);
    if (cached) {
      return cached;
    }

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const params = new URLSearchParams({
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        inst: ticker,
        archive: 'data',
      });

      const url = `${this.baseUrl}/day_end_archive.php?${params.toString()}`;
      const responseText = await fetchText(url);

      if (responseText) {
        const data = this.parseHistoricalCsv(responseText, ticker);
        writeJsonCache(cacheFile, data);
        return data;
      }
    } catch (e) {
      console.error('Historical data error:', e);
    }

    return this.fetchDailyPrices(ticker, days);
  }

  async getMarketSummary(): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/market_summary.php`;
      const html = await fetchText(url);
      if (html) {
        return this.parseMarketSummary(html);
      }
    } catch (e) {
      console.error('Market summary error:', e);
    }
    return {};
  }

  async getTopStocks(category = 'gainer'): Promise<Record<string, unknown>[]> {
    try {
      const endpointMap: Record<string, string> = {
        gainer: 'top_ten_gainer.php',
        loser: 'top_ten_loser.php',
        volume: 'top_twenty_share.php',
      };

      const endpoint = endpointMap[category] ?? 'top_ten_gainer.php';
      const url = `${this.baseUrl}/${endpoint}`;
      const html = await fetchText(url);
      if (html) {
        return this.parseTopStocks(html);
      }
    } catch (e) {
      console.error('Top stocks error:', e);
    }
    return [];
  }

  async getCompanyInfo(ticker: string): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/displayCompany.php?name=${ticker}`;
      const html = await fetchText(url);
      if (html) {
        return this.parseCompanyInfo(html);
      }
    } catch (e) {
      console.error('Company info error:', e);
    }
    return {};
  }

  parseDseCurrent(html: string, ticker: string): Record<string, unknown> {
    const pattern = new RegExp(`${ticker}.*?([0-9,.]+).*?([0-9,.]+).*?([0-9,.]+)`);
    const match = html.match(pattern);

    if (match) {
      return {
        ticker,
        last_price: parseFloat(match[1]!.replace(/,/g, '')),
        change: parseFloat(match[2]!.replace(/,/g, '')),
        volume: parseInt(match[3]!.replace(/,/g, ''), 10),
      };
    }
    return {};
  }

  parsePriceTable(html: string, ticker: string): Record<string, unknown> {
    const lines = html.split('\n');
    for (const line of lines) {
      if (line.includes(ticker)) {
        const parts = line.split(/\s+/);
        if (parts.length >= 5) {
          return {
            ticker,
            last_price: parseFloat(parts[2]!.replace(/,/g, '')),
            high: parseFloat(parts[3]!.replace(/,/g, '')),
            low: parseFloat(parts[4]!.replace(/,/g, '')),
          };
        }
      }
    }
    return {};
  }

  parseHistoricalCsv(csvData: string, _ticker: string): OhlcvRow[] {
    return parseHistoricalCsv(csvData);
  }

  async fetchDailyPrices(ticker: string, days: number): Promise<OhlcvRow[]> {
    const data: OhlcvRow[] = [];
    const currentDate = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(currentDate.getTime() - i * 24 * 60 * 60 * 1000);

      if (date.getDay() >= 5) {
        continue;
      }

      const priceData = await this.getPriceForDate(ticker, date);
      if (priceData) {
        data.push(priceData);
      }

      await sleep(100);
    }

    return data.reverse();
  }

  async getPriceForDate(_ticker: string, _date: Date): Promise<OhlcvRow | null> {
    return null;
  }

  parseMarketSummary(_html: string): Record<string, unknown> {
    return {
      dsex_index: 0,
      total_volume: 0,
      total_value: 0,
      total_trades: 0,
    };
  }

  parseTopStocks(_html: string): Record<string, unknown>[] {
    return [];
  }

  parseCompanyInfo(_html: string): Record<string, unknown> {
    return {
      pe_ratio: 0,
      eps: 0,
      nav: 0,
      market_cap: 0,
    };
  }
}

export class AlternativeDataFetcher {
  async getData(ticker: string, exchange = 'DHA'): Promise<Record<string, unknown>> {
    const sources = [
      () => this.fetchFromYahoo(ticker, exchange),
      () => this.fetchFromInvesting(ticker, exchange),
      () => this.fetchFromTradingview(ticker, exchange),
    ];

    for (const source of sources) {
      try {
        const data = await source();
        if (data && Object.keys(data).length > 0) {
          return data;
        }
      } catch {
        continue;
      }
    }
    return {};
  }

  async fetchFromYahoo(ticker: string, exchange: string): Promise<Record<string, unknown>> {
    const yahooTicker = `${ticker}.${exchange}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}`;

    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      return this.parseYahooData(data);
    }
    return {};
  }

  async fetchFromInvesting(_ticker: string, _exchange: string): Promise<Record<string, unknown>> {
    return {};
  }

  async fetchFromTradingview(_ticker: string, _exchange: string): Promise<Record<string, unknown>> {
    return {};
  }

  parseYahooData(data: Record<string, unknown>): Record<string, unknown> {
    try {
      const chart = data.chart as Record<string, unknown>;
      const result = (chart.result as Record<string, unknown>[])[0]!;
      const quotes = (result.indicators as Record<string, unknown>).quote as Record<string, unknown>[];
      const quote = quotes[0]!;

      return {
        prices: quote.close,
        volumes: quote.volume,
        timestamps: result.timestamp,
      };
    } catch {
      return {};
    }
  }
}

export class DataManager {
  readonly dataDir: string;
  readonly csvDir: string;
  readonly scraper: DSEScraper;
  readonly altFetcher: AlternativeDataFetcher;

  constructor(dataDir = 'data') {
    this.dataDir = dataDir;
    this.csvDir = join(dataDir, 'csv');
    ensureDir(this.dataDir);
    ensureDir(this.csvDir);
    this.scraper = new DSEScraper();
    this.altFetcher = new AlternativeDataFetcher();
  }

  async updateStockData(ticker: string): Promise<boolean> {
    console.log(`Fetching data for ${ticker}...`);

    let historical = await this.scraper.getHistoricalData(ticker, 365);

    if (historical.length === 0) {
      const altData = await this.altFetcher.getData(ticker);
      if (altData && Object.keys(altData).length > 0) {
        historical = this.convertAltData(altData);
      }
    }

    if (historical.length > 0) {
      const { writeCsv } = await import('./utils.js');
      const csvPath = join(this.csvDir, `${ticker}_ohlcv.csv`);
      writeCsv(csvPath, historical, ['date', 'open', 'high', 'low', 'close', 'volume']);
      console.log(`✅ Saved ${historical.length} days of data for ${ticker}`);
      return true;
    }

    console.log(`❌ No data found for ${ticker}`);
    return false;
  }

  async updateMultipleStocks(tickers: string[]): Promise<void> {
    for (const ticker of tickers) {
      await this.updateStockData(ticker);
      await sleep(1000);
    }
  }

  convertAltData(_data: Record<string, unknown>): OhlcvRow[] {
    return [];
  }
}

export const POPULAR_DSE_STOCKS = [
  'GP',
  'SQURPHARMA',
  'BATBC',
  'BRACBANK',
  'CITYBANK',
  'RENATA',
  'OLYMPIC',
  'BERGERPBL',
  'MARICO',
  'ROBI',
  'LHBL',
  'UPGDCL',
  'POWERGRID',
  'BSCCL',
  'EBL',
] as const;

export async function runDseScraperMain(): Promise<void> {
  const manager = new DataManager();

  console.log('='.repeat(50));
  console.log('DSE Data Scraper - Fetching Stock Data');
  console.log('='.repeat(50));

  await manager.updateMultipleStocks([...POPULAR_DSE_STOCKS]);

  console.log('\n✅ Data fetching complete!');
  console.log(`📁 Data saved in: ${manager.csvDir}`);
  console.log('\n🚀 Restart Docker to use the new data:');
  console.log('   docker-compose restart');
}
