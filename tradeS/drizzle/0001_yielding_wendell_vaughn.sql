CREATE TABLE `prediction_outcomes` (
	`prediction_id` integer PRIMARY KEY NOT NULL,
	`evaluated_at` integer NOT NULL,
	`price_at_prediction` real NOT NULL,
	`price_at_horizon` real NOT NULL,
	`return_pct` real NOT NULL,
	`direction_correct` integer NOT NULL,
	`max_drawdown_pct` real,
	`max_gain_pct` real,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`created_at` integer NOT NULL,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`thesis` text NOT NULL,
	`risks` text NOT NULL,
	`catalysts` text NOT NULL,
	`sources` text NOT NULL,
	`quant_snapshot` text,
	`model` text,
	`duration_ms` integer,
	`status` text NOT NULL,
	`raw` text,
	`revised_from_id` integer,
	`algo_version` integer,
	`regime` text
);
--> statement-breakpoint
CREATE INDEX `predictions_symbol_created_idx` ON `predictions` (`symbol`,`created_at`);--> statement-breakpoint
CREATE TABLE `strategy_versions` (
	`version` integer PRIMARY KEY NOT NULL,
	`parent_version` integer,
	`full_text` text NOT NULL,
	`quant_text` text NOT NULL,
	`change_summary` text NOT NULL,
	`rationale` text NOT NULL,
	`tier` text NOT NULL,
	`status` text NOT NULL,
	`scorecard` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	`retired_at` integer
);
