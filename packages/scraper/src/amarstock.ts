import type { FundamentalsPayload } from './sources.js';

const API_HOST = 'https://apiv2.amarstock.com';

/**
 * AmarStock fundamentals — lower-priority cross-check.
 * Public REST endpoints require session auth; returns {} when unavailable.
 * See https://api.amarstock.com/data-faqs for P/E methodology notes.
 */
export async function fetchAmarStockFundamentals(ticker: string): Promise<FundamentalsPayload> {
  const symbol = ticker.toUpperCase();
  const paths = [
    `/api/Stock/FundamentalBasic?symbol=${symbol}`,
    `/api/stock/fundamental-basic/${symbol}`,
    `/Stock/FundamentalBasic?symbol=${symbol}`,
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`${API_HOST}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.startsWith('<')) continue;
      const data = JSON.parse(text) as Record<string, unknown>;
      const payload = normalizeAmarStockPayload(data);
      if (Object.keys(payload).length > 0) return payload;
    } catch {
      continue;
    }
  }

  return {};
}

/** Map AmarStock response keys (including obfuscated short keys when present). */
function normalizeAmarStockPayload(data: Record<string, unknown>): FundamentalsPayload {
  const payload: FundamentalsPayload = {};

  const num = (v: unknown): number | undefined => {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  };

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (data[k] != null) return data[k];
    }
    return undefined;
  };

  const eps = num(pick('eps', 'EPS', 'aa', 'epsTtm', 'eps_ttm'));
  const pe = num(pick('pe', 'PE', 'auditedPe', 'pe_ratio'));
  if (eps != null) payload.eps_ttm = eps;
  if (pe != null && pe !== 0) payload.pe = pe;

  return payload;
}
