CREATE TABLE `kit_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_uid` text NOT NULL,
	`checkout_key` text NOT NULL,
	`items` text NOT NULL,
	`shipping` text NOT NULL,
	`total` integer NOT NULL,
	`shipping_fee` integer NOT NULL,
	`status` text NOT NULL,
	`tracking` text DEFAULT '' NOT NULL,
	`carrier` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`stock_restored` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kit_order_idempotency` ON `kit_orders` (`buyer_uid`,`checkout_key`);--> statement-breakpoint
CREATE INDEX `kit_orders_buyer` ON `kit_orders` (`buyer_uid`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `kit_orders_page` ON `kit_orders` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `kits` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`content` text NOT NULL,
	`stock` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `kits_status` ON `kits` (`status`,`updated_at`);