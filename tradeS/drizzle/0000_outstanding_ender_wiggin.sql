CREATE TABLE `bars_cache` (
	`symbol` text NOT NULL,
	`timeframe` text NOT NULL,
	`ts` integer NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real NOT NULL,
	PRIMARY KEY(`symbol`, `timeframe`, `ts`)
);
--> statement-breakpoint
CREATE INDEX `bars_cache_symbol_tf_idx` ON `bars_cache` (`symbol`,`timeframe`);--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`shares` real NOT NULL,
	`cost_basis` real NOT NULL,
	`acquired_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `jobs_status_created_idx` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `latest_prices` (
	`symbol` text PRIMARY KEY NOT NULL,
	`price` real NOT NULL,
	`prev_close` real,
	`day_open` real,
	`ts` integer NOT NULL,
	`market_open` integer NOT NULL,
	`source` text NOT NULL,
	`delayed` integer NOT NULL,
	`currency` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quant_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`computed_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`symbol` text PRIMARY KEY NOT NULL,
	`added_at` integer NOT NULL
);
