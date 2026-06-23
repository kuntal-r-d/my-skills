import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { get as httpsGet } from 'node:https';

export interface OhlcvRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeCsv(
  filePath: string,
  rows: object[],
  columns: string[],
): void {
  const lines = [columns.join(',')];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(columns.map((col) => String(record[col] ?? '')).join(','));
  }
  writeFileSync(filePath, lines.join('\n'), 'utf8');
}

export function readJsonCache<T>(filePath: string, maxAgeSeconds: number): T | null {
  try {
    const age = (Date.now() - statSync(filePath).mtimeMs) / 1000;
    if (age < maxAgeSeconds) {
      return JSON.parse(readFileSync(filePath, 'utf8')) as T;
    }
  } catch {
    // cache miss
  }
  return null;
}

export function writeJsonCache(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

/** DSE (dsebd.org) often serves an incomplete TLS chain — opt out of verification for that host only. */
function isDseHost(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('dsebd.org');
  } catch {
    return url.includes('dsebd.org');
  }
}

function fetchTextInsecure(url: string, headers: Record<string, string>): Promise<string | null> {
  return new Promise((resolve) => {
    httpsGet(url, { headers, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const code = res.statusCode ?? 0;
        resolve(code >= 200 && code < 300 ? data : null);
      });
    }).on('error', (e) => {
      console.error(`Fetch error for ${url}:`, e);
      resolve(null);
    });
  });
}

export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  const headers = {
    ...DEFAULT_HEADERS,
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (isDseHost(url)) {
    return fetchTextInsecure(url, headers);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
    });
    if (response.ok) {
      return await response.text();
    }
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
  }
  return null;
}

/** Normalize DSE / generic date strings to YYYY-MM-DD. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/"/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (mdy) {
    const [, mm, dd, yyyy] = mdy;
    return `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const yyyy = yy!.length === 2 ? `20${yy}` : yy;
    return `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
  }
  return null;
}

export function parseHistoricalCsv(csvData: string): OhlcvRow[] {
  const lines = csvData.trim().split(/\r?\n/);
  const data: OhlcvRow[] = [];

  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    if (parts.length < 6) continue;

    const first = parts[0]!.trim().toLowerCase();
    if (first === 'date' || first === 'trade date' || first.includes('dse tower')) continue;

    const date = normalizeDate(parts[0]!);
    if (!date) continue;

    const open = parseFloat(parts[1]!.replace(/,/g, ''));
    const high = parseFloat(parts[2]!.replace(/,/g, ''));
    const low = parseFloat(parts[3]!.replace(/,/g, ''));
    const close = parseFloat(parts[4]!.replace(/,/g, ''));
    const volume = parseInt(parts[5]!.replace(/,/g, ''), 10);

    if ([open, high, low, close].some((n) => Number.isNaN(n))) continue;

    data.push({
      date,
      open,
      high,
      low,
      close,
      volume: Number.isNaN(volume) ? 0 : volume,
    });
  }

  return data;
}

export function yahooChartToOhlcv(data: Record<string, unknown>): OhlcvRow[] {
  try {
    const chart = data.chart as Record<string, unknown>;
    const result = (chart.result as Record<string, unknown>[])[0];
    if (!result) return [];

    const timestamps = (result.timestamp as number[]) ?? [];
    const quotes = (result.indicators as Record<string, unknown>).quote as Record<string, unknown>[];
    const quote = quotes[0];
    if (!quote) return [];

    const opens = quote.open as (number | null)[];
    const highs = quote.high as (number | null)[];
    const lows = quote.low as (number | null)[];
    const closes = quote.close as (number | null)[];
    const volumes = quote.volume as (number | null)[];

    const ohlcv: OhlcvRow[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null) continue;
      const ts = timestamps[i]!;
      const d = new Date(ts * 1000);
      ohlcv.push({
        date: formatDate(d),
        open: opens[i] ?? close,
        high: highs[i] ?? close,
        low: lows[i] ?? close,
        close,
        volume: volumes[i] != null ? Math.floor(volumes[i]!) : 0,
      });
    }
    return ohlcv;
  } catch {
    return [];
  }
}
