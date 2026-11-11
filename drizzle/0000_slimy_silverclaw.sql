CREATE TABLE `pattern_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern_id` text NOT NULL,
	`kind` text NOT NULL,
	`author_uid` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`reply_uid` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pattern_posts_page` ON `pattern_posts` (`pattern_id`,`kind`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pattern_posts_identity` ON `pattern_posts` (`id`,`author_uid`);