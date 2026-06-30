import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseDseArchiveHtml,
  parseDseCompanyHtml,
  parseDseShareholdingHtml,
  parseStockAnalysisStatisticsHtml,
  parseStockAnalysisOhlcvHtml,
} from './sources.js';
import { parseLankabdDataMatrixHtml } from './lankabd.js';
import { parseDseNewsArchiveHtml } from './dse-news.js';
import { parseBangladeshBankInflationHtml } from './macro-bb.js';
import { normalizeDate } from './utils.js';

const fixtures = join(import.meta.dirname, '../fixtures');

describe('DSE parsers', () => {
  it('parseDseArchiveHtml extracts OHLCV from archive HTML table', () => {
    const snippet = `
      <table><thead><tr>
        <th>DATE</th><th>TRADING CODE</th><th>LTP</th><th>HIGH</th><th>LOW</th><th>OPENP</th><th>CLOSEP</th>
      </tr></thead><tbody>
        <tr><td>1</td><td>2026-06-23</td><td>LHB</td><td>54.3</td><td>54.9</td><td>53.9</td><td>54.4</td><td>54.3</td><td>54.2</td><td>1</td><td>41</td><td>759,427</td></tr>
        <tr><td>2</td><td>2026-06-22</td><td>LHB</td><td>54.2</td><td>55.4</td><td>54.0</td><td>54.2</td><td>54.2</td><td>54.0</td><td>1</td><td>40</td><td>700,000</td></tr>
      </tbody></table>`;
    const rows = parseDseArchiveHtml(snippet, 'LHB');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-06-22', close: 54.2, volume: 700000 });
    expect(rows[1]).toMatchObject({ date: '2026-06-23', close: 54.3, volume: 759427 });
  });

  it('parseDseShareholdingHtml reads nested shareholding blocks', () => {
    const html = readFileSync(join(fixtures, 'lhb-shareholding-snippet.html'), 'utf8');
    const rows = parseDseShareholdingHtml(html);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.sponsor).toBeGreaterThan(60);
  });

  it('parseDseCompanyHtml (ACI) parses market cap, NAV, trailing P/E without n/a overwrite', () => {
    const html = readFileSync(join(fixtures, 'aci-dse-company-snippet.html'), 'utf8');
    const f = parseDseCompanyHtml(html);
    expect(f.price).toBe(193.1);
    expect(f.pe).toBeUndefined();
    expect(f.market_cap).toBeCloseTo(16907630000, -3);
    expect(f.book_value_per_share).toBe(85.78);
    expect(f.dividend_yield).toBeCloseTo(0.0129, 4);
    expect(f.eps_ttm).toBe(-4.18);
    expect(f.sector).toContain('Pharmaceuticals');
  });

  it('parseDseCompanyHtml (LANKABAFIN) parses positive PE and market cap', () => {
    const html = readFileSync(join(fixtures, 'lankabafin-dse-company-snippet.html'), 'utf8');
    const f = parseDseCompanyHtml(html);
    expect(f.pe).toBe(12.45);
    expect(f.market_cap).toBeCloseTo(1234560000, -3);
    expect(f.book_value_per_share).toBe(22.1);
  });

  it('parseStockAnalysisStatisticsHtml extracts ROE, P/B, debt/equity', () => {
    const html = readFileSync(join(fixtures, 'sa-statistics-snippet.html'), 'utf8');
    const f = parseStockAnalysisStatisticsHtml(html);
    expect(f.roe).toBeCloseTo(0.0358, 4);
    expect(f.debt_to_equity).toBe(8.94);
    expect(f.pb).toBe(1.87);
    expect(f.book_value_per_share).toBe(85.78);
    expect(f.profit_margin).toBeCloseTo(-0.0014, 4);
  });

  it('parseLankabdDataMatrixHtml maps fixed column offsets (skips Buy/Sell col)', () => {
    const html = readFileSync(join(fixtures, 'lankabd-row-snippet.html'), 'utf8');
    const map = parseLankabdDataMatrixHtml(html);
    const aci = map.get('ACI');
    expect(aci).toBeDefined();
    expect(aci?.price).toBe(192.5);
    expect(aci?.market_cap).toBeCloseTo(16907630000, -3);
    expect(aci?.dividend_yield).toBeCloseTo(0.0129, 4);
    expect(aci?.book_value_per_share).toBe(85.78);
    expect(aci?.pe).toBeUndefined();
  });

  it('normalizeDate accepts StockAnalysis month-day-year labels', () => {
    expect(normalizeDate('Jun 24, 2026')).toBe('2026-06-24');
    expect(normalizeDate('Dec 1, 2025')).toBe('2025-12-01');
  });

  it('parseStockAnalysisOhlcvHtml reads month-day-year history tables', () => {
    const snippet = `
      <table><tr><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Adj. Close</th><th>Change</th><th>Volume</th></tr>
        <tr><td>Jun 24, 2026</td><td>257.50</td><td>258.00</td><td>254.90</td><td>257.50</td><td>257.50</td><td>1.02%</td><td>245,878</td></tr>
        <tr><td>Jun 23, 2026</td><td>255.00</td><td>256.00</td><td>254.00</td><td>255.00</td><td>255.00</td><td>-0.50%</td><td>200,000</td></tr>
      </table>`;
    const rows = parseStockAnalysisOhlcvHtml(snippet);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-06-23', close: 255, volume: 200000 });
    expect(rows[1]).toMatchObject({ date: '2026-06-24', close: 257.5, volume: 245878 });
  });

  it('parseDseNewsArchiveHtml extracts PSI rows', () => {
    const snippet = `
      <table class="table-news"><tr><th>Code</th><th>News</th><th>Date</th></tr>
        <tr><td>GP</td><td>Q3 EPS declared</td><td>2026-06-20</td></tr>
      </table>`;
    const rows = parseDseNewsArchiveHtml(snippet, { sourceId: 'dse_psn', category: 'price_sensitive' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.headline).toContain('GP');
    expect(rows[0]?.category).toBe('price_sensitive');
  });

  it('parseBangladeshBankInflationHtml reads point-to-point CPI', () => {
    const snippet = `
      <table><tr><td>Rate of Inflation May, 2026 Apr, 2026 Point to point 9.42% 9.04%</td></tr></table>`;
    const snap = parseBangladeshBankInflationHtml(snippet);
    expect(snap.inflation).toBeCloseTo(0.0942, 4);
    expect(snap.inflation_month).toBe('2026-May');
  });
});
