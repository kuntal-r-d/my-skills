CREATE TABLE `analysis_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker_id` integer NOT NULL,
	`skill` text DEFAULT 'analyze_ticker' NOT NULL,
	`as_of` text NOT NULL,
	`payload` text NOT NULL,
	`client_id` text,
	`model_version` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analysis_snapshots_ticker_created_idx` ON `analysis_snapshots` (`ticker_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_snapshots_skill_idx` ON `analysis_snapshots` (`skill`);--> statement-breakpoint
CREATE TABLE `data_freshness` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`ticker_id` integer,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`stale_after_hours` integer DEFAULT 24 NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `freshness_entity_ticker` ON `data_freshness` (`entity_type`,`ticker_id`);--> statement-breakpoint
CREATE TABLE `fundamentals_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker_id` integer NOT NULL,
	`as_of` text NOT NULL,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fundamentals_ticker_asof_source` ON `fundamentals_snapshots` (`ticker_id`,`as_of`,`source`);--> statement-breakpoint
CREATE TABLE `ingest_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_name` text NOT NULL,
	`ticker_id` integer,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`rows_upserted` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`source` text,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `macro_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`as_of` text NOT NULL,
	`payload` text NOT NULL,
	`source` text NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `news_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker_id` integer,
	`published_date` text NOT NULL,
	`headline` text NOT NULL,
	`source` text,
	`category` text,
	`sector_tag` text,
	`url` text,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `news_ticker_date_idx` ON `news_items` (`ticker_id`,`published_date`);--> statement-breakpoint
CREATE TABLE `ohlcv_daily` (
	`ticker_id` integer NOT NULL,
	`trade_date` text NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'dse' NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ohlcv_daily_ticker_date_idx` ON `ohlcv_daily` (`ticker_id`,`trade_date`);--> statement-breakpoint
CREATE INDEX `ohlcv_daily_ticker_date_desc_idx` ON `ohlcv_daily` (`ticker_id`,`trade_date`);--> statement-breakpoint
CREATE TABLE `portfolio_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text DEFAULT 'default' NOT NULL,
	`capital_bdt` real DEFAULT 1000000 NOT NULL,
	`risk_per_trade_pct` real DEFAULT 1 NOT NULL,
	`loan_balance_bdt` real,
	`purchasing_power_bdt` real,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portfolio_lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`ticker_id` integer NOT NULL,
	`purpose` text DEFAULT 'investment' NOT NULL,
	`trade_date` text NOT NULL,
	`qty` real NOT NULL,
	`price` real NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `portfolio_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `portfolio_lots_lookup_idx` ON `portfolio_lots` (`account_id`,`ticker_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `portfolio_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`ticker_id` integer NOT NULL,
	`purpose` text DEFAULT 'investment' NOT NULL,
	`qty` real NOT NULL,
	`avg_cost` real NOT NULL,
	`sector` text,
	`stop_level` real,
	`target_level` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `portfolio_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_account_ticker_purpose` ON `portfolio_positions` (`account_id`,`ticker_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `prediction_outcomes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker_id` integer NOT NULL,
	`signal_date` text NOT NULL,
	`predicted_action` text NOT NULL,
	`predicted_rating` text,
	`actual_return_1w` real,
	`actual_return_1m` real,
	`actual_return_3m` real,
	`criterion_id` integer,
	`agent_name` text,
	`snapshot_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `analysis_snapshots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `prediction_outcomes_ticker_date_idx` ON `prediction_outcomes` (`ticker_id`,`signal_date`);--> statement-breakpoint
CREATE TABLE `research_memos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker_id` integer,
	`session_id` text,
	`client_id` text,
	`title` text NOT NULL,
	`body_md` text NOT NULL,
	`summary_json` text,
	`as_of` text,
	`version` integer DEFAULT 1 NOT NULL,
	`parent_memo_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_memos_ticker_created_idx` ON `research_memos` (`ticker_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_memos_session_idx` ON `research_memos` (`session_id`);--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`memo_id` integer,
	`ticker_id` integer,
	`url` text,
	`title` text NOT NULL,
	`publisher` text,
	`published_date` text,
	`fetched_at` integer NOT NULL,
	`query_context` text,
	`category` text,
	`extracted_facts` text,
	`session_id` text,
	`client_id` text,
	`notes` text,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`memo_id`) REFERENCES `research_memos`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_sources_ticker_fetched_idx` ON `research_sources` (`ticker_id`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `research_sources_session_idx` ON `research_sources` (`session_id`);--> statement-breakpoint
CREATE INDEX `research_sources_category_idx` ON `research_sources` (`category`);--> statement-breakpoint
CREATE INDEX `research_sources_memo_idx` ON `research_sources` (`memo_id`);--> statement-breakpoint
CREATE TABLE `sector_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sector_slug` text NOT NULL,
	`as_of` text NOT NULL,
	`metrics_json` text NOT NULL,
	`news_summary_json` text,
	`source` text NOT NULL,
	`ingested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sector_snapshots_sector_asof_idx` ON `sector_snapshots` (`sector_slug`,`as_of`);--> statement-breakpoint
CREATE INDEX `sector_snapshots_asof_idx` ON `sector_snapshots` (`as_of`);--> statement-breakpoint
CREATE TABLE `sectors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`dse_group` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sectors_slug_idx` ON `sectors` (`slug`);--> statement-breakpoint
CREATE TABLE `shareholding_monthly` (
	`ticker_id` integer NOT NULL,
	`month` text NOT NULL,
	`sponsor` real,
	`govt` real,
	`institution` real,
	`foreign` real,
	`public` real,
	`source` text DEFAULT 'dse' NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shareholding_ticker_month_idx` ON `shareholding_monthly` (`ticker_id`,`month`);--> statement-breakpoint
CREATE TABLE `skill_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`tool_name` text,
	`name` text,
	`description` text,
	`skill_md` text NOT NULL,
	`metadata_json` text,
	`is_active` integer DEFAULT true NOT NULL,
	`client_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_overrides_slug_unique` ON `skill_overrides` (`slug`);--> statement-breakpoint
CREATE INDEX `skill_overrides_slug_idx` ON `skill_overrides` (`slug`);--> statement-breakpoint
CREATE INDEX `skill_overrides_updated_idx` ON `skill_overrides` (`updated_at`);--> statement-breakpoint
CREATE TABLE `tickers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`name` text,
	`sector` text,
	`commodity_type` text,
	`exchange` text DEFAULT 'DSE' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickers_symbol_unique` ON `tickers` (`symbol`);--> statement-breakpoint
CREATE TABLE `watchlist_tickers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker_id` integer NOT NULL,
	`purpose` text DEFAULT 'investment' NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`ticker_id`) REFERENCES `tickers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_ticker_purpose_idx` ON `watchlist_tickers` (`ticker_id`,`purpose`);