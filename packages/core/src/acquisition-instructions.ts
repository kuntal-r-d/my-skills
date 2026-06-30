/** Client-facing instructions when DB/MCP data is unavailable or incomplete (PRD-001 REQ-026). */

import { getDisclaimer } from './advisory.js';

export const CORE_CONTRACT_FIELDS = [
  'ohlcv',
  'fundamentals',
  'shareholding',
  'macro',
  'news',
] as const;

export type CoreContractField = (typeof CORE_CONTRACT_FIELDS)[number];

export const MINIMAL_CONTRACT_EXAMPLE: Record<string, unknown> = {
  ticker: 'GP',
  as_of: '2026-06-24',
  mode: 'investment',
  ohlcv: [
    { date: '2026-06-24', open: 300, high: 305, low: 298, close: 304, volume: 120000 },
  ],
  fundamentals: {
    price: 304,
    pe: 14.2,
    pb: 1.3,
    eps_ttm: 24.5,
    eps_history: [18, 20.1, 22.3, 24.5],
    book_value_per_share: 110,
    roe: 0.23,
    debt_to_equity: 0.15,
    profit_margin: 0.21,
    dividend_yield: 0.04,
    sector: 'Telecom',
  },
  shareholding: [
    { month: '2026-04', sponsor: 45, institution: 22, foreign: 8, public: 25 },
  ],
  news: [{ date: '2026-06-20', headline: 'Example headline', source: 'tbsnews.net' }],
  macro: { policy_rate: 0.1, inflation: 0.094, bdt_usd: 123.3, fx_reserves_bn: 33.2 },
  microstructure: { circuit_state: 'normal', avg_daily_value_bdt: 25000000 },
};

export const EXAMPLE_PUBLIC_SOURCES: Record<
  CoreContractField | 'portfolio' | 'connectivity',
  { example_sources: string[]; fields: string[]; notes?: string }
> = {
  connectivity: {
    example_sources: [
      'Start Postgres: docker compose up -d postgres',
      'Migrate/seed: npm run db:migrate && npm run db:seed',
      'Ingest ticker: npm run ingest -- --ticker GP --job all --days 365',
      'Reload stock-buddy-data MCP in Cursor / Claude / Codex / Gemini',
    ],
    fields: ['DATABASE_URL', 'MCP connection'],
    notes: 'If stock-buddy-data MCP fails, skip to client research below.',
  },
  ohlcv: {
    example_sources: [
      'DSE company page (e.g. dsebd.org)',
      'Financial portals (e.g. lankabd.com, amarstock.com, stocknow.com.bd)',
      'Chart/data aggregators (Investing.com, TradingView, etc.)',
      'Broker research pages, company IR sites, or any source with daily OHLCV',
    ],
    fields: ['date', 'open', 'high', 'low', 'close', 'volume'],
    notes: 'Use any source with reliable daily bars. Need ≥30 for technical; ≥200 for full momentum.',
  },
  fundamentals: {
    example_sources: [
      'Financial portals, annual reports, PSI/disclosure PDFs',
      'Company investor-relations site',
      'News articles citing audited figures',
      'Any aggregator or research site with P/E, EPS, NAV, margins',
    ],
    fields: [
      'eps_ttm',
      'eps_history',
      'book_value_per_share',
      'pe',
      'pb',
      'roe',
      'debt_to_equity',
      'profit_margin',
      'dividend_yield',
      'price',
    ],
    notes: 'Prefer primary disclosures; cross-check when sources disagree.',
  },
  shareholding: {
    example_sources: [
      'DSE monthly shareholding disclosure',
      'Financial portals, business newspapers, CSE/DSE filings',
      'Any credible article or data page with sponsor/institution/foreign/public %',
    ],
    fields: ['month', 'sponsor', 'institution', 'foreign', 'public'],
    notes: 'Monthly cadence; typically lagging. Record as_of / month on each row.',
  },
  macro: {
    example_sources: [
      'Central bank, statistics bureau, government releases',
      'Business news (policy rate, inflation, FX headlines)',
      'FX/rates pages, multilateral reports — any current macro source',
    ],
    fields: ['policy_rate', 'inflation', 'bdt_usd', 'fx_reserves_bn'],
  },
  news: {
    example_sources: [
      'Any Bangladesh business/finance news site',
      'Company press releases, exchange announcements',
      'Google/news search for the ticker — cite URL and date',
    ],
    fields: ['date', 'headline', 'source', 'category'],
  },
  portfolio: {
    example_sources: ['User-maintained via stock-buddy-data upsert_position'],
    fields: ['account.capital_bdt', 'portfolio.positions'],
  },
};

/** @deprecated alias — same as EXAMPLE_PUBLIC_SOURCES with legacy `sources` key */
export const SUGGESTED_PUBLIC_SOURCES = Object.fromEntries(
  Object.entries(EXAMPLE_PUBLIC_SOURCES).map(([k, v]) => [
    k,
    { ...v, sources: v.example_sources },
  ]),
) as Record<
  CoreContractField | 'portfolio' | 'connectivity',
  { sources: string[]; example_sources: string[]; fields: string[]; notes?: string }
>;

export const SOURCE_SELECTION_POLICY =
  'Use ANY credible public source you can access (web search, browser, PDFs, news, aggregators, exchange sites, company IR). The listed sites are examples only — not required. Prefer primary or official disclosures when available; record URL, publisher, and as_of for each fact.';

export function detectMissingCoreFields(payload: Record<string, unknown>): CoreContractField[] {
  const missing: CoreContractField[] = [];
  const ohlcv = payload.ohlcv;
  if (!Array.isArray(ohlcv) || ohlcv.length < 30) missing.push('ohlcv');

  const fundamentals = payload.fundamentals;
  if (!fundamentals || typeof fundamentals !== 'object') missing.push('fundamentals');

  const shareholding = payload.shareholding;
  if (!Array.isArray(shareholding) || shareholding.length === 0) missing.push('shareholding');

  const macro = payload.macro;
  if (!macro || typeof macro !== 'object') missing.push('macro');

  const news = payload.news;
  if (!Array.isArray(news) || news.length === 0) missing.push('news');

  return missing;
}

export type ClientResearchInstructions = {
  skill: 'dse-data-acquisition';
  reason: string;
  source_selection_policy: string;
  client_agent_action: string;
  call_order: string[];
  missing_core_fields: string[];
  needs: Record<
    string,
    { min?: string; fields: string[]; example_sources: string[]; notes?: string }
  >;
  minimal_payload_example: Record<string, unknown>;
  example_public_sources: typeof EXAMPLE_PUBLIC_SOURCES;
  /** @deprecated use example_public_sources */
  suggested_public_sources: typeof SUGGESTED_PUBLIC_SOURCES;
  after_research: string[];
  persist_research?: string[];
  disclaimer: string;
};

export function buildClientResearchInstructions(opts: {
  ticker?: string;
  missingFields: string[];
  reason: 'database_unavailable' | 'incomplete_contract' | 'bare_ticker_only' | 'transport_limited';
  partialContract?: Record<string, unknown>;
}): ClientResearchInstructions {
  const ticker = opts.ticker ?? 'TICKER';
  const missing = opts.missingFields.length
    ? opts.missingFields
    : [...CORE_CONTRACT_FIELDS];

  const reasonText: Record<typeof opts.reason, string> = {
    database_unavailable:
      'stock-buddy-data MCP could not reach PostgreSQL. The analysis server has no network fetch.',
    incomplete_contract:
      'Database contract is missing required objects. Partial DB data alone is not enough for full analyze_ticker.',
    bare_ticker_only:
      'analyze_ticker was called with only a ticker scalar. MCP clients must pass the full nested contract object.',
    transport_limited:
      'MCP transport dropped nested objects. Assemble the contract locally, then pass all fields in one analyze_ticker call.',
  };

  const needs: ClientResearchInstructions['needs'] = {};
  for (const field of missing) {
    const key = field as CoreContractField;
    const src = EXAMPLE_PUBLIC_SOURCES[key];
    if (src) {
      needs[field] = {
        min: key === 'ohlcv' ? '30 daily bars (260 preferred)' : undefined,
        fields: src.fields,
        example_sources: src.example_sources,
        notes: src.notes,
      };
    }
  }

  return {
    skill: 'dse-data-acquisition',
    reason: reasonText[opts.reason],
    source_selection_policy: SOURCE_SELECTION_POLICY,
    client_agent_action:
      'YOU (Claude Code / Codex / Gemini / Cursor agent): use web search, browser, or any tool available to gather the missing contract fields from ANY credible public source (not limited to the example sites). Assemble the shared data contract JSON, then call stock-buddy.analyze_ticker with the FULL object (not ticker-only).',
    call_order: [
      '1. Try stock-buddy-data.get_ticker_contract_for_analysis({ ticker }) — if error or _meta.missing non-empty, continue.',
      '2. Research missing fields via web search / any public source that has the data (examples in example_public_sources).',
      '3. Merge DB partial contract + researched fields into one JSON object.',
      '4. stock-buddy.analyze_ticker({ ticker, as_of, ohlcv, fundamentals, shareholding, macro, news, ... }).',
      '5. Optional: stock-buddy-data.upsert_research_sources + upsert_research_memo to save citations.',
    ],
    missing_core_fields: missing,
    needs,
    minimal_payload_example: {
      ...MINIMAL_CONTRACT_EXAMPLE,
      ticker,
      ...(opts.partialContract ?? {}),
    },
    example_public_sources: EXAMPLE_PUBLIC_SOURCES,
    suggested_public_sources: SUGGESTED_PUBLIC_SOURCES,
    after_research: [
      'Pass the assembled contract as top-level keys in analyze_ticker (ohlcv array, fundamentals object, etc.).',
      'Do NOT call individual skills with empty nested args — same transport issue.',
      'If only partial data found, run analyze_ticker anyway; stages will show which legs skipped.',
      'Cite where each fact came from (any URL/source) when saving research_sources.',
    ],
    persist_research: [
      'stock-buddy-data.upsert_research_sources({ ticker, sources: [...] })',
      'stock-buddy-data.upsert_research_memo({ ticker, title, body_md, link_all_ticker_sources: true })',
    ],
    disclaimer: getDisclaimer(),
  };
}

export function isBareTickerPayload(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload).filter((k) => payload[k] !== undefined && payload[k] !== null);
  if (keys.length === 0) return true;
  if (keys.length <= 3 && keys.every((k) => ['ticker', 'mode', 'as_of', 'client_id'].includes(k))) {
    return detectMissingCoreFields(payload).length >= 3;
  }
  return false;
}
