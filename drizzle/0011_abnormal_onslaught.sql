CREATE TABLE `image_library_trash` (
	`key` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`deleted_by` text NOT NULL,
	`deleted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `image_library_trash_date` ON `image_library_trash` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_uid` text NOT NULL,
	`owner_name` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`related_href` text DEFAULT '' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`reply` text DEFAULT '' NOT NULL,
	`internal_note` text DEFAULT '' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`history` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_owner` ON `support_tickets` (`owner_uid`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_status` ON `support_tickets` (`status`,`updated_at`);