import * as cheerio from 'cheerio';
import { join } from 'node:path';
import {
  ensureDir,
  fetchText,
  parseHistoricalCsv,
  sleep,
  writeCsv,
  type OhlcvRow,
} from './utils.js';

export interface LivePriceData {
  last_price: number;
  high: number;
  low: number;
  close: number;
  change: number;
  volume: number;
}

const BASE_PRICES: Record<string, number> = {
  GP: 239.7,
  SQURPHARMA: 212.8,
  BRACBANK: 64.1,
  ROBI: 28.8,
  BATBC: 370.7,
  CITYBANK: 28.5,
  RENATA: 900.0,
  OLYMPIC: 140.0,
  BERGERPBL: 1650.0,
  MARICO: 2200.0,
  BSCPLC: 156.3,
  BXPHARMA: 124.0,
  BSC: 102.4,
  BSRMSTEEL: 78.1,
  EBL: 25.5,
  LHB: 52.7,
  MIDLANDBNK: 17.3,
  PRIMEBANK: 29.5,
  PUBALIBANK: 33.9,
  UPGDCL: 118.0,
  WALTONHIL: 386.9,
};

export class DSELiveData {
  private readonly headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  async getCurrentPrices(): Promise<Record<string, LivePriceData>> {
    const url = 'https://www.dsebd.org/latest_share_price_scroll_l.php';

    try {
      const response = await fetch(url, { headers: this.headers });
      const html = await response.text();
      const $ = cheerio.load(html);

      const table = $('table.table');
      if (!table.length) {
        return this.getPricesAlternative();
      }

      const stocksData: Record<string, LivePriceData> = {};
      const rows = table.find('tr').slice(1);

      rows.each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 8) {
          const ticker = $(cols[1]).text().trim();
          stocksData[ticker] = {
            last_price: parseFloat($(cols[2]).text().replace(/,/g, '')),
            high: parseFloat($(cols[3]).text().replace(/,/g, '')),
            low: parseFloat($(cols[4]).text().replace(/,/g, '')),
            close: parseFloat($(cols[5]).text().replace(/,/g, '')),
            change: parseFloat($(cols[6]).text().replace(/,/g, '')),
            volume: parseInt($(cols[8]).text().replace(/,/g, ''), 10),
          };
        }
      });

      return stocksData;
    } catch (e) {
      console.error('DSE website error:', e);
      console.log('Using simulated prices for demonstration...');
      return this.getSimulatedPrices();
    }
  }

  async getPricesAlternative(): Promise<Record<string, LivePriceData>> {
    try {
      const url = 'https://www.dsebd.org/dse_close_price.php';
      await fetchText(url);
      return {};
    } catch {
      return this.getSimulatedPrices();
    }
  }

  getSimulatedPrices(): Record<string, LivePriceData> {
    const stocksData: Record<string, LivePriceData> = {};

    for (const [ticker, basePrice] of Object.entries(BASE_PRICES)) {
      const changePct = Math.random() * 0.06 - 0.03;
      const lastPrice = basePrice * (1 + changePct);

      stocksData[ticker] = {
        last_price: Math.round(lastPrice * 100) / 100,
        high: Math.round(lastPrice * 1.01 * 100) / 100,
        low: Math.round(lastPrice * 0.99 * 100) / 100,
        close: Math.round(basePrice * 100) / 100,
        change: Math.round((lastPrice - basePrice) * 100) / 100,
        volume: Math.floor(Math.random() * 990000) + 10000,
      };
    }

    return stocksData;
  }

  async getHistoricalData(ticker: string, days = 30): Promise<OhlcvRow[]> {
    const params = new URLSearchParams({
      inst: ticker,
      duration: String(days),
      type: 'price',
    });

    const url = `https://www.dsebd.org/php_graph/monthly_graph.php?${params.toString()}`;

    try {
      const text = await fetchText(url);
      if (text) {
        return this.parseHistorical(text);
      }
    } catch {
      // fall through
    }
    return [];
  }

  async getCompanyInfo(ticker: string): Promise<Record<string, number>> {
    const url = `https://www.dsebd.org/companylistbyindustry.php?industry=${ticker}`;

    try {
      const response = await fetch(url, { headers: this.headers });
      const html = await response.text();
      const $ = cheerio.load(html);

      return {
        pe: this.extractNumber($, 'P/E'),
        eps: this.extractNumber($, 'EPS'),
        nav: this.extractNumber($, 'NAV'),
        market_cap: this.extractNumber($, 'Market Cap'),
      };
    } catch {
      return {};
    }
  }

  extractNumber($: cheerio.CheerioAPI, label: string): number {
    try {
      const element = $('*').filter((_, el) => $(el).text().trim() === label).first();
      if (element.length) {
        const value = element.parent().next().text();
        return parseFloat(value.replace(/,/g, ''));
      }
    } catch {
      // fall through
    }
    return 0.0;
  }

  parseHistorical(data: string): OhlcvRow[] {
    return parseHistoricalCsv(data);
  }

  saveToCsv(ticker: string, data: Record<string, unknown>): void {
    const outputDir = join('data', 'csv');
    ensureDir(outputDir);

    if (data.ohlcv) {
      const rows = data.ohlcv as OhlcvRow[];
      writeCsv(
        join(outputDir, `${ticker}_ohlcv.csv`),
        rows,
        ['date', 'open', 'high', 'low', 'close', 'volume'],
      );
    }

    if (data.fundamentals) {
      const fundamentals = data.fundamentals as Record<string, unknown>;
      const keys = Object.keys(fundamentals);
      writeCsv(join(outputDir, `${ticker}_fundamentals.csv`), [fundamentals], keys);
    }
  }

  async updateWatchlist(tickers: string[]): Promise<void> {
    const currentPrices = await this.getCurrentPrices();

    for (const ticker of tickers) {
      console.log(`Updating ${ticker}...`);

      if (ticker in currentPrices) {
        const priceData = currentPrices[ticker]!;
        const historical = await this.getHistoricalData(ticker);
        const fundamentals = await this.getCompanyInfo(ticker);

        const data = {
          ohlcv: historical.length > 0 ? historical : [priceData],
          fundamentals,
        };

        this.saveToCsv(ticker, data);
        console.log(`✅ ${ticker} updated`);
      } else {
        console.log(`⚠️ ${ticker} not found in current prices`);
      }

      await sleep(1000);
    }
  }
}

export const DEFAULT_WATCHLIST = [
  'GP',
  'SQURPHARMA',
  'BRACBANK',
  'ROBI',
  'BATBC',
  'CITYBANK',
  'RENATA',
  'OLYMPIC',
  'BERGERPBL',
  'MARICO',
] as const;

export async function runDseLiveMain(): Promise<void> {
  const scraper = new DSELiveData();
  await scraper.updateWatchlist([...DEFAULT_WATCHLIST]);
  console.log('\n✅ Watchlist updated successfully!');
}
