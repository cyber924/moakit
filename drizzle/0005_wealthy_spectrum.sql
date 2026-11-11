CREATE TABLE `room_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`post_id` text NOT NULL,
	`author_uid` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_comments_post` ON `room_comments` (`call_id`,`post_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `room_members` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`uid` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_members_call` ON `room_members` (`call_id`);--> statement-breakpoint
CREATE TABLE `room_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`author_uid` text NOT NULL,
	`author_name` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_posts_page` ON `room_posts` (`call_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `room_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`object_key` text NOT NULL,
	`title` text NOT NULL,
	`changes` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_resources_call` ON `room_resources` (`call_id`,`created_at`);