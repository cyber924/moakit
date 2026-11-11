CREATE TABLE `room_post_reads` (
	`key` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`uid` text NOT NULL,
	`post_id` text NOT NULL,
	`read_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_read_identity` ON `room_post_reads` (`call_id`,`uid`,`post_id`);