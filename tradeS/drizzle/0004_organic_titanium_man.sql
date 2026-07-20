CREATE TABLE `backtests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`as_of` integer NOT NULL,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`thesis` text NOT NULL,
	`quant_snapshot` text,
	`price_at_as_of` real NOT NULL,
	`price_at_horizon` real NOT NULL,
	`return_pct` real NOT NULL,
	`direction_correct` integer NOT NULL,
	`created_at` integer NOT NULL,
	`algo_version` integer,
	`model` text,
	`regime` text,
	`max_drawdown_pct` real,
	`max_gain_pct` real,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE INDEX `backtests_symbol_asof_idx` ON `backtests` (`symbol`,`as_of`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prediction_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`hash` text PRIMARY KEY NOT NULL,
	`lang` text NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text NOT NULL,
	`created_at` integer NOT NULL
);
