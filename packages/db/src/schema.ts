import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const tickers = pgTable('tickers', {
  id: serial('id').primaryKey(),
  symbol: text('symbol').notNull().unique(),
  name: text('name'),
  sector: text('sector'),
  commodityType: text('commodity_type'),
  exchange: text('exchange').notNull().default('DSE'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ohlcvDaily = pgTable(
  'ohlcv_daily',
  {
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    tradeDate: date('trade_date').notNull(),
    open: doublePrecision('open').notNull(),
    high: doublePrecision('high').notNull(),
    low: doublePrecision('low').notNull(),
    close: doublePrecision('close').notNull(),
    volume: integer('volume').notNull().default(0),
    source: text('source').notNull().default('dse'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ohlcv_daily_ticker_date_idx').on(table.tickerId, table.tradeDate),
    index('ohlcv_daily_ticker_date_desc_idx').on(table.tickerId, table.tradeDate),
  ],
);

export const fundamentalsSnapshots = pgTable(
  'fundamentals_snapshots',
  {
    id: serial('id').primaryKey(),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    asOf: date('as_of').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    source: text('source').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('fundamentals_ticker_asof_source').on(table.tickerId, table.asOf, table.source)],
);

export const shareholdingMonthly = pgTable(
  'shareholding_monthly',
  {
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    month: date('month').notNull(),
    sponsor: doublePrecision('sponsor'),
    govt: doublePrecision('govt'),
    institution: doublePrecision('institution'),
    foreign: doublePrecision('foreign'),
    public: doublePrecision('public'),
    source: text('source').notNull().default('dse'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('shareholding_ticker_month_idx').on(table.tickerId, table.month)],
);

export const macroSnapshots = pgTable('macro_snapshots', {
  id: serial('id').primaryKey(),
  asOf: date('as_of').notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
  source: text('source').notNull(),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
});

export const newsItems = pgTable(
  'news_items',
  {
    id: serial('id').primaryKey(),
    tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'cascade' }),
    publishedDate: date('published_date').notNull(),
    headline: text('headline').notNull(),
    source: text('source'),
    category: text('category'),
    url: text('url'),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('news_ticker_date_idx').on(table.tickerId, table.publishedDate)],
);

export const portfolioAccounts = pgTable('portfolio_accounts', {
  id: serial('id').primaryKey(),
  label: text('label').notNull().default('default'),
  capitalBdt: doublePrecision('capital_bdt').notNull().default(1_000_000),
  riskPerTradePct: doublePrecision('risk_per_trade_pct').notNull().default(1.0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const portfolioPositions = pgTable(
  'portfolio_positions',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .notNull()
      .references(() => portfolioAccounts.id, { onDelete: 'cascade' }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    qty: doublePrecision('qty').notNull(),
    avgCost: doublePrecision('avg_cost').notNull(),
    sector: text('sector'),
    stopLevel: doublePrecision('stop_level'),
    targetLevel: doublePrecision('target_level'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('portfolio_account_ticker').on(table.accountId, table.tickerId)],
);

export const ingestRuns = pgTable('ingest_runs', {
  id: serial('id').primaryKey(),
  jobName: text('job_name').notNull(),
  tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  rowsUpserted: integer('rows_upserted').notNull().default(0),
  errorMessage: text('error_message'),
  source: text('source'),
});

export const dataFreshness = pgTable(
  'data_freshness',
  {
    id: serial('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'cascade' }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    staleAfterHours: integer('stale_after_hours').notNull().default(24),
  },
  (table) => [unique('freshness_entity_ticker').on(table.entityType, table.tickerId)],
);

export const watchlistTickers = pgTable(
  'watchlist_tickers',
  {
    id: serial('id').primaryKey(),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull().default('investment'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('watchlist_ticker_purpose_idx').on(table.tickerId, table.purpose)],
);

/** Immutable skill/agent analysis results (REQ-005 audit trail). */
export const analysisSnapshots = pgTable(
  'analysis_snapshots',
  {
    id: serial('id').primaryKey(),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    skill: text('skill').notNull().default('analyze_ticker'),
    asOf: date('as_of').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    clientId: text('client_id'),
    modelVersion: text('model_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('analysis_snapshots_ticker_created_idx').on(table.tickerId, table.createdAt),
    index('analysis_snapshots_skill_idx').on(table.skill),
  ],
);

export const predictionOutcomes = pgTable(
  'prediction_outcomes',
  {
    id: serial('id').primaryKey(),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    signalDate: date('signal_date').notNull(),
    predictedAction: text('predicted_action').notNull(),
    predictedRating: text('predicted_rating'),
    actualReturn1w: doublePrecision('actual_return_1w'),
    actualReturn1m: doublePrecision('actual_return_1m'),
    actualReturn3m: doublePrecision('actual_return_3m'),
    criterionId: integer('criterion_id'),
    agentName: text('agent_name'),
    snapshotId: integer('snapshot_id').references(() => analysisSnapshots.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('prediction_outcomes_ticker_date_idx').on(table.tickerId, table.signalDate)],
);
