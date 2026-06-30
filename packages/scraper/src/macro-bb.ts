import * as cheerio from 'cheerio';
import { fetchText } from './utils.js';

const BB_INFLATION_URL = 'https://www.bb.org.bd/en/index.php/econdata/inflation';

export interface BangladeshMacroSnapshot {
  inflation?: number;
  inflation_month?: string;
  source: string;
}

/** Parse Bangladesh Bank CPI inflation (table is often single-row without clean th/td). */
export function parseBangladeshBankInflationHtml(html: string): BangladeshMacroSnapshot {
  const $ = cheerio.load(html);
  const snapshot: BangladeshMacroSnapshot = { source: 'bangladesh_bank' };
  const tableText = $('table').first().text().replace(/\s+/g, ' ');

  const ptp = tableText.match(/Point to point\s*([\d.]+)\s*%/i);
  if (ptp) {
    const n = parseFloat(ptp[1]!);
    if (Number.isFinite(n)) snapshot.inflation = n / 100;
  }

  const headerPart = tableText.split(/Point to point/i)[0] ?? tableText;
  const monthMatches = [
    ...headerPart.matchAll(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s*(\d{4})/gi),
  ];
  const latest = monthMatches.find((m) => Number(m[2]) >= 2025);
  if (latest) {
    snapshot.inflation_month = `${latest[2]}-${latest[1]!.slice(0, 3)}`;
  }

  return snapshot;
}

export async function fetchBangladeshBankMacro(): Promise<BangladeshMacroSnapshot> {
  const html = await fetchText(BB_INFLATION_URL);
  if (!html) return { source: 'bangladesh_bank' };
  return parseBangladeshBankInflationHtml(html);
}
