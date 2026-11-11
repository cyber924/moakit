CREATE TABLE `member_notices` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`audience` text NOT NULL,
	`recipient_uid` text DEFAULT '' NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notices_audience` ON `member_notices` (`status`,`audience`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`key` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`notification_id` text NOT NULL,
	`read_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_read_identity` ON `notification_reads` (`uid`,`notification_id`);