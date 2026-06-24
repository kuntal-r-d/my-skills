import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseDseArchiveHtml,
  parseDseCompanyHtml,
  parseDseShareholdingHtml,
  parseStockAnalysisStatisticsHtml,
} from './sources.js';
import { parseLankabdDataMatrixHtml } from './lankabd.js';

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
});
