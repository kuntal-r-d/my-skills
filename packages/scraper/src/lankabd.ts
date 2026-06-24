import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { ensureDir, fetchText, readJsonCache, writeJsonCache } from './utils.js';
import type { FundamentalsPayload } from './sources.js';

const LANKABD_URL = 'https://lankabd.com/Home/DataMatrix';
const CACHE_TTL_SEC = 24 * 60 * 60;

function cacheFilePath(): string {
  const dir = process.env.INGEST_CACHE_DIR ?? join(tmpdir(), 'stock-buddy-ingest');
  ensureDir(dir);
  return join(dir, 'lankabd-datamatrix.json');
}

/** Column index map — column 1 is Buy/Sell actions, not data. */
const COL = {
  symbol: 0,
  sector: 2,
  ltp: 3,
  auditedPe: 14,
  marketCapMn: 22,
  dividendYieldPct: 26,
  eps: 29,
  nav: 30,
  beta: 33,
} as const;

function parseNum(raw: string): number | undefined {
  const v = raw.trim().replace(/,/g, '');
  if (!v || v === '-' || /^n\/a$/i.test(v)) return undefined;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function rowToPayload(cells: string[]): FundamentalsPayload | null {
  const symbol = cells[COL.symbol]?.trim().toUpperCase();
  if (!symbol || symbol.length < 2) return null;

  const payload: FundamentalsPayload = { _symbol: symbol };
  const price = parseNum(cells[COL.ltp] ?? '');
  const eps = parseNum(cells[COL.eps] ?? '');
  const nav = parseNum(cells[COL.nav] ?? '');
  const pe = parseNum(cells[COL.auditedPe] ?? '');
  const mcMn = parseNum(cells[COL.marketCapMn] ?? '');
  const dyPct = parseNum(cells[COL.dividendYieldPct] ?? '');
  const beta = parseNum(cells[COL.beta] ?? '');
  const sector = cells[COL.sector]?.trim();

  if (price != null) payload.price = price;
  if (eps != null) payload.eps_ttm = eps;
  if (nav != null) payload.book_value_per_share = nav;
  if (pe != null && pe !== 0) payload.pe = pe;
  if (mcMn != null) payload.market_cap = mcMn * 1e6;
  if (dyPct != null) payload.dividend_yield = dyPct / 100;
  if (beta != null) payload.beta = beta;
  if (sector) payload.sector = sector;
  if (price != null && nav != null && nav > 0) payload.pb = price / nav;

  return payload;
}

/** Parse LankaBangla DataMatrix HTML into a symbol → payload map. */
export function parseLankabdDataMatrixHtml(html: string): Map<string, FundamentalsPayload> {
  const $ = cheerio.load(html);
  const map = new Map<string, FundamentalsPayload>();

  $('#TableDataMatrix tbody tr').each((_, tr) => {
    const cells: string[] = [];
    $(tr)
      .find('td')
      .each((__, td) => {
        cells.push($(td).text().trim());
      });
    if (cells.length < 10) return;

    const symbolCell = $(tr).find('td').first().find('a').first().text().trim().toUpperCase();
    if (symbolCell) cells[COL.symbol] = symbolCell;

    const payload = rowToPayload(cells);
    if (payload) {
      const sym = String(payload._symbol);
      delete payload._symbol;
      map.set(sym, payload);
    }
  });

  return map;
}

export async function fetchLankabdDataMatrix(): Promise<Map<string, FundamentalsPayload>> {
  const cachePath = cacheFilePath();
  const cached = readJsonCache<Record<string, FundamentalsPayload>>(cachePath, CACHE_TTL_SEC);
  if (cached) {
    return new Map(Object.entries(cached));
  }

  const html = await fetchText(LANKABD_URL);
  if (!html) return new Map();

  const map = parseLankabdDataMatrixHtml(html);
  writeJsonCache(cachePath, Object.fromEntries(map));
  return map;
}

export async function fetchLankabdFundamentals(ticker: string): Promise<FundamentalsPayload> {
  const map = await fetchLankabdDataMatrix();
  return map.get(ticker.toUpperCase()) ?? {};
}
