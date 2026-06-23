import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

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

export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...DEFAULT_HEADERS, ...(init?.headers as Record<string, string> | undefined) },
    });
    if (response.ok) {
      return await response.text();
    }
  } catch (e) {
    console.error(`Fetch error for ${url}:`, e);
  }
  return null;
}

export function parseHistoricalCsv(csvData: string): OhlcvRow[] {
  const lines = csvData.trim().split('\n');
  const data: OhlcvRow[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length >= 6) {
      try {
        data.push({
          date: parts[0]!,
          open: parseFloat(parts[1]!),
          high: parseFloat(parts[2]!),
          low: parseFloat(parts[3]!),
          close: parseFloat(parts[4]!),
          volume: parseInt(parts[5]!, 10),
        });
      } catch {
        continue;
      }
    }
  }

  return data;
}
