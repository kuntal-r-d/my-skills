import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const tickers = sqliteTable('tickers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull().unique(),
  name: text('name'),
  sector: text('sector'),
  commodityType: text('commodity_type'),
  exchange: text('exchange').notNull().default('DSE'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const ohlcvDaily = sqliteTable(
  'ohlcv_daily',
  {
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    tradeDate: text('trade_date').notNull(),
    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    volume: integer('volume').notNull().default(0),
    source: text('source').notNull().default('dse'),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ohlcv_daily_ticker_date_idx').on(table.tickerId, table.tradeDate),
    index('ohlcv_daily_ticker_date_desc_idx').on(table.tickerId, table.tradeDate),
  ],
);

export const fundamentalsSnapshots = sqliteTable(
  'fundamentals_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    asOf: text('as_of').notNull(),
    payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    source: text('source').notNull(),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [unique('fundamentals_ticker_asof_source').on(table.tickerId, table.asOf, table.source)],
);

export const shareholdingMonthly = sqliteTable(
  'shareholding_monthly',
  {
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    month: text('month').notNull(),
    sponsor: real('sponsor'),
    govt: real('govt'),
    institution: real('institution'),
    foreign: real('foreign'),
    public: real('public'),
    source: text('source').notNull().default('dse'),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('shareholding_ticker_month_idx').on(table.tickerId, table.month)],
);

export const macroSnapshots = sqliteTable('macro_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  asOf: text('as_of').notNull(),
  payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
  source: text('source').notNull(),
  ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

/** Canonical DSE sector taxonomy with alias mapping. */
export const sectors = sqliteTable(
  'sectors',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    dseGroup: text('dse_group'),
    aliases: text('aliases', { mode: 'json' }).notNull().$type<string[]>().default([]),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('sectors_slug_idx').on(table.slug)],
);

/** Daily deterministic sector aggregates (returns, PE, news counts). */
export const sectorSnapshots = sqliteTable(
  'sector_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sectorSlug: text('sector_slug').notNull(),
    asOf: text('as_of').notNull(),
    metricsJson: text('metrics_json', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    newsSummaryJson: text('news_summary_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    source: text('source').notNull(),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('sector_snapshots_sector_asof_idx').on(table.sectorSlug, table.asOf),
    index('sector_snapshots_asof_idx').on(table.asOf),
  ],
);

export const newsItems = sqliteTable(
  'news_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'cascade' }),
    publishedDate: text('published_date').notNull(),
    headline: text('headline').notNull(),
    source: text('source'),
    category: text('category'),
    sectorTag: text('sector_tag'),
    url: text('url'),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('news_ticker_date_idx').on(table.tickerId, table.publishedDate)],
);

export const portfolioAccounts = sqliteTable('portfolio_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull().default('default'),
  capitalBdt: real('capital_bdt').notNull().default(1_000_000),
  riskPerTradePct: real('risk_per_trade_pct').notNull().default(1.0),
  loanBalanceBdt: real('loan_balance_bdt'),
  purchasingPowerBdt: real('purchasing_power_bdt'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const portfolioPositions = sqliteTable(
  'portfolio_positions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => portfolioAccounts.id, { onDelete: 'cascade' }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull().default('investment'),
    qty: real('qty').notNull(),
    avgCost: real('avg_cost').notNull(),
    sector: text('sector'),
    stopLevel: real('stop_level'),
    targetLevel: real('target_level'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [unique('portfolio_account_ticker_purpose').on(table.accountId, table.tickerId, table.purpose)],
);

/** Individual buy fills that roll up into portfolio_positions totals. */
export const portfolioLots = sqliteTable(
  'portfolio_lots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id')
      .notNull()
      .references(() => portfolioAccounts.id, { onDelete: 'cascade' }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull().default('investment'),
    tradeDate: text('trade_date').notNull(),
    qty: real('qty').notNull(),
    price: real('price').notNull(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('portfolio_lots_lookup_idx').on(table.accountId, table.tickerId, table.purpose)],
);

export const ingestRuns = sqliteTable('ingest_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobName: text('job_name').notNull(),
  tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'set null' }),
  status: text('status').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  rowsUpserted: integer('rows_upserted').notNull().default(0),
  errorMessage: text('error_message'),
  source: text('source'),
});

export const dataFreshness = sqliteTable(
  'data_freshness',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'cascade' }),
    lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
    staleAfterHours: integer('stale_after_hours').notNull().default(24),
  },
  (table) => [unique('freshness_entity_ticker').on(table.entityType, table.tickerId)],
);

export const watchlistTickers = sqliteTable(
  'watchlist_tickers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull().default('investment'),
    addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('watchlist_ticker_purpose_idx').on(table.tickerId, table.purpose)],
);

/** Immutable skill/agent analysis results (REQ-005 audit trail). */
export const analysisSnapshots = sqliteTable(
  'analysis_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    skill: text('skill').notNull().default('analyze_ticker'),
    asOf: text('as_of').notNull(),
    payload: text('payload', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    clientId: text('client_id'),
    modelVersion: text('model_version'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('analysis_snapshots_ticker_created_idx').on(table.tickerId, table.createdAt),
    index('analysis_snapshots_skill_idx').on(table.skill),
  ],
);

/** Web/agent research citations saved from client sessions (REQ-014 lineage). */
export const researchMemos = sqliteTable(
  'research_memos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'cascade' }),
    sessionId: text('session_id'),
    clientId: text('client_id'),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    summaryJson: text('summary_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    asOf: text('as_of'),
    version: integer('version').notNull().default(1),
    parentMemoId: integer('parent_memo_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('research_memos_ticker_created_idx').on(table.tickerId, table.createdAt),
    index('research_memos_session_idx').on(table.sessionId),
  ],
);

export const researchSources = sqliteTable(
  'research_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    memoId: integer('memo_id').references(() => researchMemos.id, { onDelete: 'set null' }),
    tickerId: integer('ticker_id').references(() => tickers.id, { onDelete: 'cascade' }),
    url: text('url'),
    title: text('title').notNull(),
    publisher: text('publisher'),
    publishedDate: text('published_date'),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    queryContext: text('query_context'),
    category: text('category'),
    extractedFacts: text('extracted_facts', { mode: 'json' }).$type<Record<string, unknown>>(),
    sessionId: text('session_id'),
    clientId: text('client_id'),
    notes: text('notes'),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('research_sources_ticker_fetched_idx').on(table.tickerId, table.fetchedAt),
    index('research_sources_session_idx').on(table.sessionId),
    index('research_sources_category_idx').on(table.category),
    index('research_sources_memo_idx').on(table.memoId),
  ],
);

/** Custom SKILL.md overrides (dashboard / MCP skill editor). */
export const skillOverrides = sqliteTable(
  'skill_overrides',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    toolName: text('tool_name'),
    name: text('name'),
    description: text('description'),
    skillMd: text('skill_md').notNull(),
    metadataJson: text('metadata_json', { mode: 'json' }).$type<Record<string, unknown>>(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    clientId: text('client_id'),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('skill_overrides_slug_idx').on(table.slug),
    index('skill_overrides_updated_idx').on(table.updatedAt),
  ],
);

export const predictionOutcomes = sqliteTable(
  'prediction_outcomes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tickerId: integer('ticker_id')
      .notNull()
      .references(() => tickers.id, { onDelete: 'cascade' }),
    signalDate: text('signal_date').notNull(),
    predictedAction: text('predicted_action').notNull(),
    predictedRating: text('predicted_rating'),
    actualReturn1w: real('actual_return_1w'),
    actualReturn1m: real('actual_return_1m'),
    actualReturn3m: real('actual_return_3m'),
    criterionId: integer('criterion_id'),
    agentName: text('agent_name'),
    snapshotId: integer('snapshot_id').references(() => analysisSnapshots.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('prediction_outcomes_ticker_date_idx').on(table.tickerId, table.signalDate)],
);
