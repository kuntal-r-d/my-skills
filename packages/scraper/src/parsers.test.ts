import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDseArchiveHtml, parseDseShareholdingHtml } from './sources.js';

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
    const fixturePath = join(import.meta.dirname, '../fixtures/lhb-shareholding-snippet.html');
    const html = readFileSync(fixturePath, 'utf8');
    const rows = parseDseShareholdingHtml(html);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]?.sponsor).toBeGreaterThan(60);
  });
});
