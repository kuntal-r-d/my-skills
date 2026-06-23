import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BaseDataProvider,
  type FundamentalsRecord,
  type MarketDataRecord,
  type NewsItem,
  type OhlcvRecord,
  type ProviderCapabilities,
  type ProviderConfig,
  type SectorDataRecord,
} from '../interface.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));

interface FixtureData {
  ohlcv?: OhlcvRecord[];
  fundamentals?: FundamentalsRecord;
  market?: MarketDataRecord;
  overnight_news?: Array<Record<string, unknown>>;
}

export class FileProvider extends BaseDataProvider {
  private readonly fixturesPath: string;

  constructor(config: ProviderConfig = {}) {
    super(config);
    const configuredPath =
      typeof config.fixtures_path === 'string' ? config.fixtures_path : 'skills/_fixtures';
    this.fixturesPath = join(process.cwd(), configuredPath);
  }

  private async loadFixture(filename: string): Promise<FixtureData> {
    const candidates = [
      join(this.fixturesPath, filename),
      join(process.cwd(), 'skills/_fixtures', filename),
      join(moduleDir, '../../../../skills/_fixtures', filename),
    ];

    for (const filepath of candidates) {
      try {
        const raw = await readFile(filepath, 'utf8');
        return JSON.parse(raw) as FixtureData;
      } catch {
        continue;
      }
    }

    return {};
  }

  async getOhlcv(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<OhlcvRecord[]> {
    const data = await this.loadFixture('sample_input.json');

    if (data.ohlcv) {
      return data.ohlcv.filter((record) => record.date >= startDate && record.date <= endDate);
    }

    return this.generateSyntheticOhlcv(ticker, startDate, endDate);
  }

  async getFundamentals(_ticker: string): Promise<FundamentalsRecord> {
    const data = await this.loadFixture('sample_input.json');

    if (data.fundamentals) {
      return data.fundamentals;
    }

    return {
      market_cap: 10_000_000_000,
      pe_ratio: 15.5,
      eps: 12.5,
      dividend_yield: 0.045,
      book_value: 150.0,
      debt_to_equity: 0.35,
      roe: 0.18,
      revenue: 5_000_000_000,
      profit_margin: 0.12,
      beta: 1.1,
      shares_outstanding: 80_000_000,
    };
  }

  async getMarketData(targetDate: string): Promise<MarketDataRecord> {
    const data = await this.loadFixture('sample_input.json');

    if (data.market) {
      return data.market;
    }

    return {
      dse_index: 5523.45,
      dse30_index: 2156.78,
      total_volume: 1_234_567_890,
      total_trades: 52_341,
      total_value: 9_876_543_210,
      advances: 142,
      declines: 98,
      unchanged: 47,
      date: targetDate,
    };
  }

  async getSectorData(sector: string, targetDate: string): Promise<SectorDataRecord> {
    const sectors: Record<string, Omit<SectorDataRecord, 'sector' | 'date'>> = {
      Banking: {
        index: 1523.45,
        change_pct: 1.25,
        volume: 450_000_000,
        trades: 12_500,
      },
      Pharmaceuticals: {
        index: 3421.56,
        change_pct: -0.75,
        volume: 280_000_000,
        trades: 8900,
      },
      Textile: {
        index: 892.34,
        change_pct: 0.45,
        volume: 150_000_000,
        trades: 5600,
      },
    };

    const sectorData = sectors[sector] ?? {
      index: 1000.0,
      change_pct: 0.0,
      volume: 100_000_000,
      trades: 5000,
    };

    const prefix = sector.slice(0, 3);

    return {
      sector,
      date: targetDate,
      ...sectorData,
      top_gainers: [
        { ticker: `${prefix}1`, change_pct: 5.2 },
        { ticker: `${prefix}2`, change_pct: 3.8 },
      ],
      top_losers: [
        { ticker: `${prefix}3`, change_pct: -4.1 },
        { ticker: `${prefix}4`, change_pct: -2.9 },
      ],
    };
  }

  async getNews(
    ticker?: string,
    _startDate?: string,
    _endDate?: string,
    limit = 10,
  ): Promise<NewsItem[]> {
    const data = await this.loadFixture('sample_input.json');
    const news: NewsItem[] = [];

    if (data.overnight_news) {
      for (const item of data.overnight_news.slice(0, limit)) {
        const newsItem: NewsItem = {
          date: typeof item.date === 'string' ? item.date : todayIso(),
          ticker: typeof item.ticker === 'string' ? item.ticker : undefined,
          headline: typeof item.headline === 'string' ? item.headline : undefined,
          source: typeof item.source === 'string' ? item.source : 'DSE',
          category: 'news',
        };

        if (ticker && newsItem.ticker !== ticker) {
          continue;
        }

        news.push(newsItem);
      }
    }

    if (news.length < 3) {
      news.push(
        {
          date: todayIso(),
          ticker: ticker ?? 'GP',
          headline: 'Q3 earnings exceed expectations',
          source: 'DSE',
          category: 'disclosure',
        },
        {
          date: todayIso(),
          ticker: ticker ?? 'BATBC',
          headline: 'Dividend announcement for FY2024',
          source: 'Company',
          category: 'dividend',
        },
      );
    }

    return news.slice(0, limit);
  }

  getCapabilities(): ProviderCapabilities {
    return {
      realtime: false,
      historical: true,
      fundamentals: true,
      news: true,
      sectors: true,
      fixture_based: true,
    };
  }

  private generateSyntheticOhlcv(
    _ticker: string,
    startDate: string,
    endDate: string,
  ): OhlcvRecord[] {
    const ohlcv: OhlcvRecord[] = [];
    let current = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    let basePrice = 200.0;

    while (current <= end) {
      if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) {
        const variation = Math.random() * 0.06 - 0.03;
        const close = basePrice * (1 + variation);
        const high = close * (1 + Math.random() * 0.02);
        const low = close * (0.98 + Math.random() * 0.02);
        const open = basePrice;

        ohlcv.push({
          date: formatIsoDate(current),
          open: round(open),
          high: round(high),
          low: round(low),
          close: round(close),
          volume: randomInt(500_000, 2_000_000),
        });

        basePrice = close;
      }

      current = addDays(current, 1);
    }

    return ohlcv;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
