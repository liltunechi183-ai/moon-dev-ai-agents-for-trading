CREATE TABLE `bot_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer NOT NULL,
	`rule_id` integer,
	`rule_version` integer,
	`symbol` text,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`order_id` text,
	`snapshot` text
);
--> statement-breakpoint
CREATE TABLE `bot_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_rule_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` integer NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`condition` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`condition` text NOT NULL,
	`action` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`rule_id` integer,
	`rule_version` integer,
	`exit_rule_id` integer,
	`qty` real NOT NULL,
	`entry_order_id` text NOT NULL,
	`exit_order_id` text NOT NULL,
	`entry_at` integer NOT NULL,
	`exit_at` integer NOT NULL,
	`entry_price` real NOT NULL,
	`exit_price` real NOT NULL,
	`pnl_usd` real NOT NULL,
	`pnl_pct` real NOT NULL,
	`exit_kind` text NOT NULL
);
