import { createHash } from 'node:crypto';
import type {
  DataProvider,
  FundamentalsRecord,
  MarketDataRecord,
  NewsItem,
  OhlcvRecord,
  ProviderCapabilities,
  SectorDataRecord,
} from '../interface.js';

interface CacheEntry {
  value: unknown;
  expiry: number;
  created: string;
  hits: number;
}

export class MemoryCache {
  private readonly cache = new Map<string, CacheEntry>();
  readonly defaultTtl: number;

  constructor(defaultTtl = 300) {
    this.defaultTtl = defaultTtl;
  }

  generateKey(...parts: unknown[]): string {
    const keyStr = JSON.stringify(parts);
    return createHash('md5').update(keyStr).digest('hex');
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() / 1000 < entry.expiry) {
      entry.hits += 1;
      return entry.value as T;
    }

    this.cache.delete(key);
    return undefined;
  }

  set(key: string, value: unknown, ttl?: number): void {
    const resolvedTtl = ttl ?? this.defaultTtl;
    this.cache.set(key, {
      value,
      expiry: Date.now() / 1000 + resolvedTtl,
      created: new Date().toISOString(),
      hits: 0,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  cleanupExpired(): number {
    const currentTime = Date.now() / 1000;
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (currentTime >= entry.expiry) {
        this.cache.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  getStats(): Record<string, number> {
    const currentTime = Date.now() / 1000;
    let expired = 0;
    let totalHits = 0;

    for (const entry of this.cache.values()) {
      if (currentTime >= entry.expiry) {
        expired += 1;
      }
      totalHits += entry.hits;
    }

    const totalEntries = this.cache.size;

    return {
      total_entries: totalEntries,
      expired_entries: expired,
      active_entries: totalEntries - expired,
      total_hits: totalHits,
      cache_size_bytes: this.estimateSize(),
    };
  }

  private estimateSize(): number {
    try {
      return Buffer.byteLength(JSON.stringify([...this.cache.entries()]));
    } catch {
      return 0;
    }
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export class CachedProvider implements DataProvider {
  readonly provider: DataProvider;
  readonly cache: MemoryCache;

  constructor(provider: DataProvider, cache?: MemoryCache) {
    this.provider = provider;
    this.cache = cache ?? new MemoryCache();
  }

  async getOhlcv(
    ticker: string,
    startDate: string,
    endDate: string,
  ): Promise<OhlcvRecord[]> {
    const cacheKey = this.cache.generateKey('ohlcv', ticker, startDate, endDate);
    const cached = this.cache.get<OhlcvRecord[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.provider.getOhlcv(ticker, startDate, endDate);
    this.cache.set(cacheKey, result, 3600);
    return result;
  }

  async getFundamentals(ticker: string): Promise<FundamentalsRecord> {
    const cacheKey = this.cache.generateKey('fundamentals', ticker);
    const cached = this.cache.get<FundamentalsRecord>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.provider.getFundamentals(ticker);
    this.cache.set(cacheKey, result, 1800);
    return result;
  }

  async getMarketData(targetDate: string): Promise<MarketDataRecord> {
    const cacheKey = this.cache.generateKey('market', targetDate);
    const cached = this.cache.get<MarketDataRecord>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.provider.getMarketData(targetDate);
    const ttl = targetDate === todayIso() ? 60 : 3600;
    this.cache.set(cacheKey, result, ttl);
    return result;
  }

  async getSectorData(sector: string, targetDate: string): Promise<SectorDataRecord> {
    const cacheKey = this.cache.generateKey('sector', sector, targetDate);
    const cached = this.cache.get<SectorDataRecord>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.provider.getSectorData(sector, targetDate);
    const ttl = targetDate === todayIso() ? 60 : 3600;
    this.cache.set(cacheKey, result, ttl);
    return result;
  }

  async getNews(
    ticker?: string,
    startDate?: string,
    endDate?: string,
    limit = 10,
  ): Promise<NewsItem[]> {
    const cacheKey = this.cache.generateKey('news', ticker, startDate, endDate, limit);
    const cached = this.cache.get<NewsItem[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const result = await this.provider.getNews(ticker, startDate, endDate, limit);
    this.cache.set(cacheKey, result, 300);
    return result;
  }

  async healthCheck() {
    return this.provider.healthCheck();
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...this.provider.getCapabilities(),
      cached: true,
    };
  }
}
