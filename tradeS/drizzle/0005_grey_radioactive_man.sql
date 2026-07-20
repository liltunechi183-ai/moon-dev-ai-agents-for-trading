CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prediction_id` integer,
	`backtest_id` integer,
	`source` text NOT NULL,
	`symbol` text NOT NULL,
	`regime` text,
	`algo_version` integer,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`return_pct` real NOT NULL,
	`direction_correct` integer NOT NULL,
	`root_cause` text NOT NULL,
	`evidence` text NOT NULL,
	`rule_of_thumb` text NOT NULL,
	`model` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lessons_cause_created_idx` ON `lessons` (`root_cause`,`created_at`);--> statement-breakpoint
CREATE INDEX `lessons_prediction_idx` ON `lessons` (`prediction_id`);--> statement-breakpoint
CREATE INDEX `lessons_backtest_idx` ON `lessons` (`backtest_id`);--> statement-breakpoint
CREATE TABLE `rule_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer,
	`rule_version` integer,
	`suggested_condition` text,
	`suggested_action` text,
	`summary` text NOT NULL,
	`evidence` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `shadow_predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`created_at` integer NOT NULL,
	`strategy_version` integer NOT NULL,
	`paired_prediction_id` integer,
	`outlook` text NOT NULL,
	`confidence` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`thesis` text NOT NULL,
	`model` text,
	`regime` text,
	`evaluated_at` integer,
	`price_at_prediction` real,
	`price_at_horizon` real,
	`return_pct` real,
	`direction_correct` integer,
	`max_drawdown_pct` real,
	`max_gain_pct` real,
	`neutral_band_pct` real,
	`benchmark_return_pct` real
);
--> statement-breakpoint
CREATE INDEX `shadow_symbol_created_idx` ON `shadow_predictions` (`symbol`,`created_at`);--> statement-breakpoint
CREATE INDEX `shadow_version_idx` ON `shadow_predictions` (`strategy_version`);