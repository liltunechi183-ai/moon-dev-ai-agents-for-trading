CREATE TABLE `account_snapshots` (
	`ts` integer PRIMARY KEY NOT NULL,
	`equity` real NOT NULL,
	`cash` real NOT NULL,
	`buying_power` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alpaca_order_id` text NOT NULL,
	`parent_order_id` text,
	`symbol` text NOT NULL,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`qty` real,
	`notional` real,
	`limit_price` real,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`submitted_at` integer NOT NULL,
	`filled_at` integer,
	`filled_avg_price` real,
	`raw` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_log_alpaca_order_id_unique` ON `orders_log` (`alpaca_order_id`);