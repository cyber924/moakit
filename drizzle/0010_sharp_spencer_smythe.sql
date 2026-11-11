CREATE TABLE `pattern_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_uid` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`seller_name` text NOT NULL,
	`member_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`search_text` text NOT NULL,
	`status` text NOT NULL,
	`price` integer NOT NULL,
	`missing` integer NOT NULL,
	`is_test` integer DEFAULT 0 NOT NULL,
	`invalid` integer DEFAULT 0 NOT NULL,
	`content` text NOT NULL,
	`source_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`synced_at` text NOT NULL,
	`sync_generation` text DEFAULT '' NOT NULL,
	`popular` integer DEFAULT 0 NOT NULL,
	`recommended` integer DEFAULT 0 NOT NULL,
	`weekly_best` integer DEFAULT 0 NOT NULL,
	`rank` integer DEFAULT 100 NOT NULL,
	`merch_version` integer DEFAULT 1 NOT NULL,
	`last_operation` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pattern_catalog_owner` ON `pattern_catalog` (`seller_uid`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `pattern_catalog_status` ON `pattern_catalog` (`status`,`rank`,`id`);--> statement-breakpoint
CREATE TABLE `pattern_management_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern_id` text NOT NULL,
	`actor_uid` text NOT NULL,
	`actor_name` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pattern_management_history` ON `pattern_management_logs` (`pattern_id`,`created_at`);