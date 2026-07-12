/** Registry mapping MCP tool names to Stock Buddy skills.
 *
 * The MCP server exposes one tool per skill. Each entry records the skill folder,
 * a short description (reused as the MCP tool description), and the top-level
 * input fields the skill reads (used to build a helpful inputSchema).
 *
 * Skills run in-process via @stock-buddy/skills. SKILLS_DIR is resolved at
 * import time but can be overridden with STOCK_BUDDY_SKILLS_DIR for compatibility
 * (legacy subprocess layout); it is not used for dispatch.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// packages/mcp-server/src -> repo root -> skills
const _DEFAULT_SKILLS_DIR = path.resolve(__dirname, '../../../skills');
export const SKILLS_DIR = path.resolve(
  process.env.STOCK_BUDDY_SKILLS_DIR ?? _DEFAULT_SKILLS_DIR,
);

export interface SkillSpec {
  skill: string;
  description: string;
  reads: readonly string[];
}

/** tool_name -> spec */
export const SKILLS: Record<string, SkillSpec> = {
  technical_analysis: {
    skill: 'technical-analysis',
    description:
      'Run the DSE Technical Committee over OHLCV history; returns a weighted '
      + 'technical score, rating, and reasoning (RSI/MACD/ADX/Bollinger/volume).',
    reads: ['ohlcv', 'mode', 'microstructure', 'ticker', 'as_of'],
  },
  momentum_screen: {
    skill: 'momentum-screen',
    description:
      'Deprecated — returns Minervini SEPA only. Prefer minervini_sepa, can_slim, '
      + 'darvas_box, livermore_pivot or analyze_ticker momentum mode.',
    reads: ['ohlcv', 'fundamentals', 'market_index', 'ticker', 'as_of'],
  },
  minervini_sepa: {
    skill: 'minervini-sepa',
    description:
      'Mark Minervini SEPA trend template + VCP + growth checklist; returns Momentum Grade A+..F.',
    reads: ['ohlcv', 'fundamentals', 'market_index', 'ticker', 'as_of'],
  },
  can_slim: {
    skill: 'can-slim',
    description:
      "William O'Neil CAN SLIM checklist (C/A/N/S/L/I/M) for DSE momentum leaders.",
    reads: ['ohlcv', 'fundamentals', 'market_index', 'shareholding', 'funds', 'ticker', 'as_of'],
  },
  darvas_box: {
    skill: 'darvas-box',
    description:
      'Nicolas Darvas box theory: consolidation box, breakout volume, box-floor stop.',
    reads: ['ohlcv', 'ticker', 'as_of'],
  },
  livermore_pivot: {
    skill: 'livermore-pivot',
    description:
      'Jesse Livermore pivot point, volume confirmation, and pyramiding levels.',
    reads: ['ohlcv', 'market_index', 'ticker', 'as_of'],
  },
  stage_analysis: {
    skill: 'stage-analysis',
    description:
      'Stan Weinstein stage analysis (1–4) on weekly chart with 30-week MA trend filter.',
    reads: ['ohlcv', 'ohlcv_weekly', 'ticker', 'as_of'],
  },
  dow_theory: {
    skill: 'dow-theory',
    description:
      'Dow Theory market trend: primary/secondary trends, volume confirmation, DSEX index pair.',
    reads: ['ohlcv', 'market_index', 'market_index_secondary', 'ticker', 'as_of'],
  },
  launchpad: {
    skill: 'launchpad',
    description:
      'Minervini Launchpad / VCP final contraction readiness with sector momentum filter.',
    reads: ['ohlcv', 'ohlcv_weekly', 'fundamentals', 'market_index', 'ticker', 'as_of'],
  },
  multi_timeframe: {
    skill: 'multi-timeframe',
    description:
      'Daily/weekly/monthly trend confluence, Weinstein stages, and conflict detection.',
    reads: ['ohlcv', 'ohlcv_weekly', 'ohlcv_monthly', 'ticker', 'as_of'],
  },
  fundamental_analysis: {
    skill: 'fundamental-analysis',
    description:
      'Balance-sheet read, valuation (DCF/Graham/PE) fair-value range, and a '
      + 'fundamental score with red flags.',
    reads: ['fundamentals', 'ticker', 'as_of'],
  },
  value_investment_checklist: {
    skill: 'value-investment-checklist',
    description:
      'Score a stock against the 30-point Buffett/Graham/Lynch value checklist '
      + 'and return an Investment Grade.',
    reads: ['fundamentals', 'ticker', 'as_of'],
  },
  smart_money_flow: {
    skill: 'smart-money-flow',
    description:
      'Accumulation/distribution from public shareholding deltas and disclosed '
      + 'fund moves (public data only).',
    reads: ['shareholding', 'funds', 'ticker', 'as_of'],
  },
  sentiment_news: {
    skill: 'sentiment-news',
    description:
      'News sentiment with rumour-vs-fundamentals separation for a DSE ticker.',
    reads: ['news', 'mode', 'ticker', 'as_of'],
  },
  macro_regime: {
    skill: 'macro-regime',
    description:
      'Assess Bangladesh market regime and emit a risk-appetite multiplier.',
    reads: ['macro', 'ticker', 'as_of'],
  },
  signal_synthesizer: {
    skill: 'signal-synthesizer',
    description:
      'Fuse per-agent sub-scores into dual-mode (Investment/Momentum) signals '
      + 'with a 1-10 DSE Composite Score and confluence/stand-aside logic.',
    reads: ['agents', 'microstructure', 'ticker', 'as_of'],
  },
  risk_manager: {
    skill: 'risk-manager',
    description:
      'Convert a signal + price data into a risk-checked recommendation: ATR buy '
      + 'zone, stop, target, position size in BDT, and pass/fail risk gates.',
    reads: ['ohlcv', 'account', 'signal', 'microstructure', 'fundamentals', 'portfolio'],
  },
  stock_screener: {
    skill: 'stock-screener',
    description:
      'Screen a universe of DSE stocks by fundamental/technical filters, a named '
      + 'template, or a natural-language query.',
    reads: ['universe', 'filters', 'template', 'query', 'mode', 'limit'],
  },
  pattern_miner: {
    skill: 'pattern-miner',
    description:
      'Discover and validate recurring price patterns for one ticker with '
      + 'anti-overfitting safeguards (train/holdout, min occurrences).',
    reads: ['ohlcv', 'params', 'ticker', 'as_of'],
  },
  daily_briefing: {
    skill: 'daily-briefing',
    description:
      'Produce a pre-market briefing with regime, level alerts, news, risk items, '
      + 'and portfolio/watchlist signal summary for decision-making.',
    reads: ['portfolio', 'watchlist', 'calendar', 'overnight_news', 'macro_regime', 'as_of'],
  },
  ticker_dossier: {
    skill: 'ticker-dossier',
    description:
      'Consolidate analysis Thinking Cards into one Markdown dossier (PDF-ready).',
    reads: ['cards', 'data', 'ticker', 'as_of'],
  },
  financial_terms_educator: {
    skill: 'financial-terms-educator',
    description:
      'Explain financial terms bilingually (EN/BN) with dual-strategy impact; '
      + 'look up a term, annotate metrics, or list all terms.',
    reads: ['term', 'terms', 'metrics', 'list'],
  },
  sector_macro_insights: {
    skill: 'sector-macro-insights',
    description:
      'Sector-level macro insights for DSE — Bangladesh/global analysis, cross-sector '
      + 'themes. Returns context instructions for host LLM; persist memos via data MCP.',
    reads: ['sector', 'scope', 'context', 'as_of', 'insight_type', 'memo_body', 'summary_json'],
  },
};

/** Permissive object schema; skills validate their own required fields and
 * return a structured {"error": ...} when inputs are insufficient. */
export function inputSchema(toolName: string): Record<string, unknown> {
  const reads = SKILLS[toolName]?.reads ?? [];
  return {
    type: 'object',
    description:
      'Stock Buddy shared data-contract object. Fields this skill reads: '
      + reads.join(', ')
      + '. See skills/README.md for the full contract.',
    additionalProperties: true,
  };
}

/** Legacy helper — returns the skill folder path (compatibility only). */
export function skillDir(toolName: string): string {
  const spec = SKILLS[toolName];
  return path.join(SKILLS_DIR, spec.skill);
}

/** Whether the legacy skill folder exists on disk (informational). */
export function skillDirExists(toolName: string): boolean {
  return existsSync(skillDir(toolName));
}
