CREATE TABLE `creator_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
