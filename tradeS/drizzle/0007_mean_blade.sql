CREATE TABLE `strategy_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`strategy` text NOT NULL,
	`symbol` text NOT NULL,
	`entry_ts` integer NOT NULL,
	`entry_date` text NOT NULL,
	`entry_order_id` text,
	`entry_price` real NOT NULL,
	`stop_price` real NOT NULL,
	`target_price` real NOT NULL,
	`max_bars` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_ts` integer,
	`close_reason` text
);
--> statement-breakpoint
CREATE INDEX `strategy_positions_status_idx` ON `strategy_positions` (`status`,`strategy`);--> statement-breakpoint
CREATE INDEX `strategy_positions_symbol_idx` ON `strategy_positions` (`symbol`);