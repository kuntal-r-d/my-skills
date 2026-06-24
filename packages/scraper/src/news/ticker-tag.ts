import { sortedAliasNeedles } from './ticker-aliases.js';

export interface TickerRef {
  id: number;
  symbol: string;
  name?: string | null;
}

const ALIAS_NEEDLES = sortedAliasNeedles();

/** Strip trailing " - Source Name" common in Google News RSS titles. */
export function normalizeHeadlineForTagging(headline: string): string {
  return headline
    .replace(/\s*[-–—|]\s*[^-–—|]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tagTickerInHeadline(
  headline: string,
  tickers: TickerRef[],
  url?: string | null,
): number | null {
  const cleanHeadline = normalizeHeadlineForTagging(headline);
  const haystack = `${cleanHeadline}\n${url ?? ''}`;
  const textLatin = haystack.toLowerCase();
  const bySymbol = new Map(tickers.map((t) => [t.symbol, t.id]));
  const bySymbolList = [...tickers].sort((a, b) => b.symbol.length - a.symbol.length);

  for (const { needle, symbol } of ALIAS_NEEDLES) {
    if (!matchesNeedle(haystack, textLatin, needle)) continue;
    const id = bySymbol.get(symbol);
    if (id != null) return id;
  }

  for (const t of bySymbolList) {
    if (matchesSymbol(haystack, t.symbol)) return t.id;
  }

  for (const t of bySymbolList) {
    const name = (t.name ?? '').toLowerCase();
    if (name.length >= 6 && textLatin.includes(name.slice(0, Math.min(name.length, 24)))) {
      return t.id;
    }
    for (const token of nameTokens(name)) {
      if (token.length >= 5 && textLatin.includes(token)) return t.id;
    }
  }

  return null;
}

function matchesNeedle(haystack: string, textLatin: string, needle: string): boolean {
  const isBn = /[\u0980-\u09FF]/.test(needle);
  if (isBn) return haystack.includes(needle);
  if (needle.length <= 3) return matchesLatinToken(textLatin, needle.toLowerCase());
  return haystack.includes(needle) || textLatin.includes(needle.toLowerCase());
}

function nameTokens(name: string): string[] {
  const stop = new Set(['ltd', 'limited', 'plc', 'company', 'co', 'industries', 'bangladesh']);
  return name
    .split(/[\s,.]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 5 && !stop.has(w));
}

function matchesSymbol(text: string, symbol: string): boolean {
  const sym = symbol.toLowerCase();
  if (sym.length <= 3) {
    return matchesLatinToken(text.toLowerCase(), sym);
  }
  return text.toLowerCase().includes(sym);
}

function matchesLatinToken(text: string, token: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escapeRe(token)}(?![a-z0-9])`, 'i').test(text);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
