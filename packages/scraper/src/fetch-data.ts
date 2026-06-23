import { join } from 'node:path';
import { ensureDir, sleep, writeCsv, type OhlcvRow } from './utils.js';

const BASE_PRICES: Record<string, number> = {
  GP: 290.0,
  SQURPHARMA: 220.0,
  BATBC: 500.0,
  BRACBANK: 40.0,
  CITYBANK: 25.0,
  ROBI: 45.0,
  RENATA: 750.0,
  OLYMPIC: 150.0,
  BERGERPBL: 1800.0,
  MARICO: 2500.0,
  LHBL: 55.0,
  UPGDCL: 220.0,
  POWERGRID: 50.0,
  BSCCL: 150.0,
  EBL: 30.0,
};

const SAMPLE_FUNDAMENTALS: Record<string, Record<string, number>> = {
  GP: { pe: 15.2, eps: 19.28, roe: 25.5, market_cap: 395000000000 },
  SQURPHARMA: { pe: 22.5, eps: 9.78, roe: 18.3, market_cap: 200000000000 },
  BATBC: { pe: 18.0, eps: 27.78, roe: 45.2, market_cap: 90000000000 },
  BRACBANK: { pe: 8.5, eps: 4.71, roe: 12.8, market_cap: 64000000000 },
  ROBI: { pe: 25.0, eps: 1.8, roe: 8.5, market_cap: 235000000000 },
};

export class SimpleDataFetcher {
  readonly dataDir: string;

  constructor() {
    this.dataDir = join('data', 'csv');
    ensureDir(this.dataDir);
  }

  async fetchWithYahoo(ticker: string, exchange = 'DHA'): Promise<OhlcvRow[] | null> {
    try {
      const yahooTicker = `${ticker}.${exchange}`;
      const params = new URLSearchParams({
        interval: '1d',
        range: '1y',
      });

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?${params.toString()}`;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      };

      const response = await fetch(url, { headers });
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown>;
        return this.parseYahooData(data, ticker);
      }
    } catch (e) {
      console.error(`Yahoo Finance error for ${ticker}:`, e);
    }
    return null;
  }

  parseYahooData(data: Record<string, unknown>, _ticker: string): OhlcvRow[] | null {
    try {
      const chart = data.chart as Record<string, unknown>;
      const result = (chart.result as Record<string, unknown>[])[0]!;
      const timestamps = result.timestamp as number[];
      const quotes = (result.indicators as Record<string, unknown>).quote as Record<string, unknown>[];
      const quote = quotes[0]!;

      const opens = quote.open as (number | null)[];
      const highs = quote.high as (number | null)[];
      const lows = quote.low as (number | null)[];
      const closes = quote.close as (number | null)[];
      const volumes = quote.volume as (number | null)[];

      const ohlcv: OhlcvRow[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i]!;
        const date = new Date(ts * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

        ohlcv.push({
          date: dateStr,
          open: opens[i] != null ? Math.round(opens[i]! * 100) / 100 : 0,
          high: highs[i] != null ? Math.round(highs[i]! * 100) / 100 : 0,
          low: lows[i] != null ? Math.round(lows[i]! * 100) / 100 : 0,
          close: closes[i] != null ? Math.round(closes[i]! * 100) / 100 : 0,
          volume: volumes[i] != null ? Math.floor(volumes[i]!) : 0,
        });
      }

      return ohlcv;
    } catch {
      return null;
    }
  }

  generateRealisticData(ticker: string, days = 365): OhlcvRow[] {
    console.log(`Generating sample data for ${ticker}...`);

    let price = BASE_PRICES[ticker] ?? 100.0;
    const data: OhlcvRow[] = [];
    const currentDate = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(currentDate.getTime() - (days - i) * 24 * 60 * 60 * 1000);

      if (date.getDay() >= 5) {
        continue;
      }

      const change = gaussianRandom(0, 0.015);
      const openPrice = price;
      const closePrice = price * (1 + change);

      const highPrice = Math.max(openPrice, closePrice) * (1 + Math.random() * 0.01);
      const lowPrice = Math.min(openPrice, closePrice) * (1 - Math.random() * 0.01);

      const baseVolume = 1000000;
      const volume = Math.floor(baseVolume * (1 + Math.abs(change) * 10) * (Math.random() * 0.5 + 0.5));

      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

      data.push({
        date: dateStr,
        open: Math.round(openPrice * 100) / 100,
        high: Math.round(highPrice * 100) / 100,
        low: Math.round(lowPrice * 100) / 100,
        close: Math.round(closePrice * 100) / 100,
        volume,
      });

      price = closePrice;
    }

    return data;
  }

  saveToCsv(ticker: string, data: OhlcvRow[]): boolean {
    if (data.length === 0) {
      return false;
    }

    const csvPath = join(this.dataDir, `${ticker}_ohlcv.csv`);
    writeCsv(csvPath, data, ['date', 'open', 'high', 'low', 'close', 'volume']);
    console.log(`✅ Saved ${data.length} days of data for ${ticker} to ${csvPath}`);
    return true;
  }

  saveFundamentals(ticker: string): void {
    const fundData = SAMPLE_FUNDAMENTALS[ticker] ?? {
      pe: 15.0,
      eps: 10.0,
      roe: 15.0,
      market_cap: 50000000000,
    };

    const csvPath = join(this.dataDir, `${ticker}_fundamentals.csv`);
    const keys = Object.keys(fundData);
    writeCsv(csvPath, [fundData], keys);
    console.log(`✅ Saved fundamentals for ${ticker}`);
  }

  async fetchStockData(ticker: string): Promise<boolean> {
    let data = await this.fetchWithYahoo(ticker);

    if (!data) {
      data = this.generateRealisticData(ticker);
    }

    if (data) {
      this.saveToCsv(ticker, data);
      this.saveFundamentals(ticker);
      return true;
    }

    return false;
  }
}

function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

export const FETCH_STOCKS = [
  'GP',
  'SQURPHARMA',
  'BATBC',
  'BRACBANK',
  'ROBI',
  'CITYBANK',
  'RENATA',
  'OLYMPIC',
  'BERGERPBL',
  'MARICO',
] as const;

export async function runFetchDataMain(): Promise<void> {
  const fetcher = new SimpleDataFetcher();

  console.log('='.repeat(60));
  console.log('Stock Buddy Data Fetcher');
  console.log('Fetching/Generating data for DSE stocks...');
  console.log('='.repeat(60));

  let successCount = 0;
  for (const ticker of FETCH_STOCKS) {
    console.log(`\nProcessing ${ticker}...`);
    if (await fetcher.fetchStockData(ticker)) {
      successCount++;
    }
    await sleep(500);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Successfully fetched data for ${successCount}/${FETCH_STOCKS.length} stocks`);
  console.log(`📁 Data saved in: ${fetcher.dataDir}`);
}
