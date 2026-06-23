import { CachedProvider, MemoryCache } from './cache/memory-cache.js';
import type { DataProvider, ProviderCapabilities, ProviderConfig } from './interface.js';
import { DSEProvider } from './providers/dse-provider.js';
import { FileProvider } from './providers/file-provider.js';
import { MockProvider } from './providers/mock-provider.js';

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export class RateLimiter {
  readonly rate: number;
  readonly per: number;
  private tokens: number;
  private updatedAt: number;
  private lock: Promise<void> = Promise.resolve();

  totalRequests = 0;
  blockedRequests = 0;
  private readonly waitTimes: number[] = [];

  constructor(rate = 10, per = 1.0) {
    this.rate = rate;
    this.per = per;
    this.tokens = rate;
    this.updatedAt = Date.now() / 1000;
  }

  async acquire(tokens = 1): Promise<number> {
    return this.withLock(async () => {
      const waitTime = await this.acquireInternal(tokens);
      this.totalRequests += 1;
      if (waitTime > 0) {
        this.blockedRequests += 1;
        this.waitTimes.push(waitTime);
      }
      return waitTime;
    });
  }

  private async acquireInternal(tokens: number): Promise<number> {
    while (true) {
      const now = Date.now() / 1000;
      const elapsed = now - this.updatedAt;
      this.tokens = Math.min(this.rate, this.tokens + elapsed * (this.rate / this.per));
      this.updatedAt = now;

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return 0;
      }

      const tokensNeeded = tokens - this.tokens;
      const waitTime = tokensNeeded * (this.per / this.rate);
      await sleep(waitTime);
      return waitTime;
    }
  }

  canProceed(tokens = 1): boolean {
    const now = Date.now() / 1000;
    const elapsed = now - this.updatedAt;
    const available = Math.min(this.rate, this.tokens + elapsed * (this.rate / this.per));
    return available >= tokens;
  }

  getStats(): Record<string, number | string> {
    return {
      rate: `${this.rate} per ${this.per}s`,
      available_tokens: this.tokens,
      total_requests: this.totalRequests,
      blocked_requests: this.blockedRequests,
      block_rate: this.totalRequests > 0 ? this.blockedRequests / this.totalRequests : 0,
      avg_wait_time:
        this.waitTimes.length > 0
          ? this.waitTimes.reduce((sum, value) => sum + value, 0) / this.waitTimes.length
          : 0,
    };
  }

  reset(): void {
    this.tokens = this.rate;
    this.updatedAt = Date.now() / 1000;
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export class RateLimitedProvider implements DataProvider {
  readonly provider: DataProvider;
  readonly rateLimiter: RateLimiter;

  constructor(provider: DataProvider, rateLimiter?: RateLimiter) {
    this.provider = provider;
    this.rateLimiter = rateLimiter ?? new RateLimiter(10, 1.0);
  }

  async getOhlcv(ticker: string, startDate: string, endDate: string) {
    await this.rateLimiter.acquire();
    return this.provider.getOhlcv(ticker, startDate, endDate);
  }

  async getFundamentals(ticker: string) {
    await this.rateLimiter.acquire();
    return this.provider.getFundamentals(ticker);
  }

  async getMarketData(targetDate: string) {
    await this.rateLimiter.acquire();
    return this.provider.getMarketData(targetDate);
  }

  async getSectorData(sector: string, targetDate: string) {
    await this.rateLimiter.acquire();
    return this.provider.getSectorData(sector, targetDate);
  }

  async getNews(ticker?: string, startDate?: string, endDate?: string, limit = 10) {
    await this.rateLimiter.acquire();
    return this.provider.getNews(ticker, startDate, endDate, limit);
  }

  async healthCheck() {
    return this.provider.healthCheck();
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...this.provider.getCapabilities(),
      rate_limited: true,
      rate_limit: this.rateLimiter.getStats(),
    };
  }
}

export type ProviderType = 'file' | 'dse' | 'mock';

export interface CreateProviderOptions {
  providerType?: ProviderType;
  withCache?: boolean;
  withRateLimit?: boolean;
  config?: ProviderConfig;
}

export function createProvider(options: CreateProviderOptions = {}): DataProvider {
  const {
    providerType = 'file',
    withCache = true,
    withRateLimit = true,
    config = {},
  } = options;

  let provider: DataProvider;

  switch (providerType) {
    case 'file':
      provider = new FileProvider(config);
      break;
    case 'dse':
      provider = new DSEProvider(config);
      break;
    case 'mock':
      provider = new MockProvider(config);
      break;
    default:
      throw new Error(`Unknown provider type: ${providerType as string}`);
  }

  if (withCache) {
    provider = new CachedProvider(provider, new MemoryCache());
  }

  if (withRateLimit) {
    const rateLimiter = new RateLimiter(
      typeof config.rate_limit === 'number' ? config.rate_limit : 10,
      typeof config.rate_period === 'number' ? config.rate_period : 1.0,
    );
    provider = new RateLimitedProvider(provider, rateLimiter);
  }

  return provider;
}
