import { z } from 'zod';

export const OhlcvBarSchema = z.object({
  date: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional().default(0),
});

export const FundamentalsSchema = z
  .object({
    eps_ttm: z.number().optional(),
    eps_history: z.array(z.number()).optional(),
    book_value_per_share: z.number().optional(),
    pe: z.number().optional(),
    pb: z.number().optional(),
    roe: z.number().optional(),
    debt_to_equity: z.number().optional(),
    current_ratio: z.number().optional(),
    profit_margin: z.number().optional(),
    free_cash_flow: z.number().optional(),
    dividend_yield: z.number().optional(),
    revenue_growth: z.number().optional(),
    earnings_growth: z.number().optional(),
    peg: z.number().optional(),
    ncav_per_share: z.number().optional(),
    interest_coverage: z.number().optional(),
    sector: z.string().optional(),
  })
  .passthrough();

export const ShareholdingRowSchema = z
  .object({
    month: z.string(),
    sponsor: z.number().optional(),
    govt: z.number().optional(),
    institution: z.number().optional(),
    foreign: z.number().optional(),
    public: z.number().optional(),
  })
  .passthrough();

export const NewsItemSchema = z
  .object({
    date: z.string(),
    headline: z.string(),
    source: z.string().optional(),
    category: z.string().optional(),
  })
  .passthrough();

export const MacroSchema = z
  .object({
    policy_rate: z.number().optional(),
    fx_reserves_bn: z.number().optional(),
    inflation: z.number().optional(),
    bdt_usd: z.number().optional(),
  })
  .passthrough();

export const MicrostructureSchema = z
  .object({
    circuit_state: z.string().optional(),
    floor_price: z.number().nullable().optional(),
    halted: z.boolean().optional(),
    avg_daily_value_bdt: z.number().optional(),
  })
  .passthrough();

export const AccountSchema = z
  .object({
    capital_bdt: z.number().optional(),
    risk_per_trade_pct: z.number().optional(),
  })
  .passthrough();

export const SkillInputSchema = z
  .object({
    ticker: z.string().optional(),
    mode: z.enum(['momentum', 'investment']).optional(),
    as_of: z.string().optional(),
    ohlcv: z.array(OhlcvBarSchema).optional(),
    market_index: z.array(z.object({ date: z.string(), close: z.number() })).optional(),
    fundamentals: FundamentalsSchema.optional(),
    shareholding: z.array(ShareholdingRowSchema).optional(),
    news: z.array(NewsItemSchema).optional(),
    macro: MacroSchema.optional(),
    microstructure: MicrostructureSchema.optional(),
    account: AccountSchema.optional(),
    agents: z.record(z.object({ score: z.number(), confidence: z.number() })).optional(),
    signal: z.record(z.unknown()).optional(),
    portfolio: z.record(z.unknown()).optional(),
    watchlist: z.array(z.unknown()).optional(),
    calendar: z.array(z.unknown()).optional(),
    overnight_news: z.array(z.unknown()).optional(),
    macro_regime: z.record(z.unknown()).optional(),
    cards: z.record(z.unknown()).optional(),
    data: z.record(z.unknown()).optional(),
    universe: z.array(z.record(z.unknown())).optional(),
    filters: z.array(z.unknown()).optional(),
    template: z.string().optional(),
    query: z.string().optional(),
    limit: z.number().optional(),
    params: z.record(z.unknown()).optional(),
    funds: z.array(z.unknown()).optional(),
    term: z.string().optional(),
    terms: z.array(z.string()).optional(),
    metrics: z.record(z.unknown()).optional(),
    list: z.boolean().optional(),
  })
  .passthrough();

export type OhlcvBar = z.infer<typeof OhlcvBarSchema>;
export type Fundamentals = z.infer<typeof FundamentalsSchema>;
export type SkillInput = z.infer<typeof SkillInputSchema>;

export interface ThinkingCard {
  skill: string;
  ticker?: string;
  mode?: string;
  as_of?: string;
  score?: number;
  confidence?: number;
  rating?: string;
  key_metrics?: Record<string, number | string | null>;
  reasoning?: string[];
  flags?: string[];
  disclaimer?: string;
  error?: string;
  [key: string]: unknown;
}

export class SkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillError';
  }
}
