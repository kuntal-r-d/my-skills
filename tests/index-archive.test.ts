import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDseIndexHistoryHtml,
  DSE_INDEX_SYMBOLS,
} from '../packages/scraper/src/index-archive.ts';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'helpers', 'dse-index-history-snippet.html');

describe('parseDseIndexHistoryHtml', () => {
  it('parses DSEX/DSES/DS30 levels into flat OHLCV rows', () => {
    const html = readFileSync(FIXTURE, 'utf8');
    const series = parseDseIndexHistoryHtml(html);
    for (const key of DSE_INDEX_SYMBOLS) {
      expect(series[key].length).toBe(2);
      expect(series[key][0]!.date).toBe('2026-08-09');
      expect(series[key][1]!.date).toBe('2026-08-10');
      expect(series[key][1]!.open).toBe(series[key][1]!.close);
      expect(series[key][1]!.high).toBe(series[key][1]!.close);
      expect(series[key][1]!.low).toBe(series[key][1]!.close);
    }
    expect(series.DSEX[1]!.close).toBeCloseTo(5844.87198);
    expect(series.DSES[1]!.close).toBeCloseTo(1174.64789);
    expect(series.DS30[1]!.close).toBeCloseTo(2185.85315);
    expect(series.DSEX[1]!.volume).toBe(324301844);
  });

  it('returns empty series when the index table is absent', () => {
    const series = parseDseIndexHistoryHtml('<html><body><p>no table</p></body></html>');
    expect(series.DSEX).toEqual([]);
    expect(series.DSES).toEqual([]);
    expect(series.DS30).toEqual([]);
  });
});
