CREATE TABLE `pattern_images` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_uid` text NOT NULL,
	`work_id` text NOT NULL,
	`path` text NOT NULL,
	`original_name` text NOT NULL,
	`author_name` text NOT NULL,
	`work_title` text NOT NULL,
	`byte_size` integer NOT NULL,
	`original_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`mime` text NOT NULL,
	`sha256` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pattern_image_path` ON `pattern_images` (`path`);--> statement-breakpoint
CREATE INDEX `pattern_image_owner` ON `pattern_images` (`seller_uid`,`work_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`updated_at` text NOT NULL
);
