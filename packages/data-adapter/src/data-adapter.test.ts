import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CachedProvider } from './cache/memory-cache.js';
import {
  createProvider,
  RateLimitedProvider,
} from './rate-limiter.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixturesPath = join(repoRoot, 'skills/_fixtures');

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('data adapter', () => {
  it('retrieves OHLCV, fundamentals, market, sector, and news data', async () => {
    const provider = createProvider({
      providerType: 'file',
      withCache: true,
      withRateLimit: true,
      config: { fixtures_path: fixturesPath },
    });

    const startDate = '2026-01-01';
    const endDate = '2026-03-17';

    const ohlcv = await provider.getOhlcv('GP', startDate, endDate);
    expect(ohlcv.length).toBeGreaterThan(0);
    expect(ohlcv[0]).toHaveProperty('date');
    expect(ohlcv[0]).toHaveProperty('close');

    const fundamentals = await provider.getFundamentals('GP');
    expect(fundamentals).toBeDefined();
    expect(fundamentals.pe ?? fundamentals.pe_ratio).toBeDefined();

    const marketData = await provider.getMarketData(todayIso());
    expect(marketData.dse_index).toBeDefined();
    expect(marketData.total_volume).toBeDefined();

    const sectorData = await provider.getSectorData('Banking', todayIso());
    expect(sectorData.index).toBeDefined();
    expect(sectorData.change_pct).toBeDefined();
    expect(sectorData.sector).toBe('Banking');

    const news = await provider.getNews('GP', undefined, undefined, 5);
    expect(news.length).toBeGreaterThan(0);
    expect(news[0]).toHaveProperty('headline');
  });

  it('caches repeated OHLCV requests', async () => {
    const provider = createProvider({
      providerType: 'file',
      withCache: true,
      withRateLimit: true,
      config: { fixtures_path: fixturesPath },
    });

    const startDate = '2026-01-01';
    const endDate = '2026-03-17';

    await provider.getOhlcv('GP', startDate, endDate);
    await provider.getOhlcv('GP', startDate, endDate);

    expect(provider).toBeInstanceOf(RateLimitedProvider);
    const inner = (provider as RateLimitedProvider).provider;
    expect(inner).toBeInstanceOf(CachedProvider);

    const stats = (inner as CachedProvider).cache.getStats();
    expect(stats.total_hits).toBeGreaterThan(0);
  });

  it('reports provider capabilities', async () => {
    const provider = createProvider({
      providerType: 'file',
      withCache: true,
      withRateLimit: true,
      config: { fixtures_path: fixturesPath },
    });

    const capabilities = provider.getCapabilities();
    expect(capabilities.historical).toBe(true);
    expect(capabilities.fundamentals).toBe(true);
    expect(capabilities.cached).toBe(true);
    expect(capabilities.rate_limited).toBe(true);
  });
});

describe('rate limiting', () => {
  it('throttles rapid requests', async () => {
    const provider = createProvider({
      providerType: 'mock',
      withCache: false,
      withRateLimit: true,
      config: { rate_limit: 2, rate_period: 1.0 },
    });

    expect(provider).toBeInstanceOf(RateLimitedProvider);
    const rateLimited = provider as RateLimitedProvider;

    const start = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await provider.getFundamentals(`TEST${i}`);
    }
    const elapsed = (Date.now() - start) / 1000;

    expect(elapsed).toBeGreaterThanOrEqual(0.9);

    const stats = rateLimited.rateLimiter.getStats();
    expect(stats.total_requests).toBe(5);
    expect(stats.blocked_requests).toBeGreaterThan(0);
  });
});
