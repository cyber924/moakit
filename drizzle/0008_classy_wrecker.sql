CREATE TABLE `work_records` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_uid` text NOT NULL,
	`work_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`registration_no` text NOT NULL,
	`state` text NOT NULL,
	`kind` text NOT NULL,
	`snapshot` text NOT NULL,
	`digest` text NOT NULL,
	`previous_digest` text DEFAULT '' NOT NULL,
	`pdf_version` text NOT NULL,
	`actor_uid` text NOT NULL,
	`actor_name` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`source_content` text NOT NULL,
	`listing_content` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_record_sequence` ON `work_records` (`seller_uid`,`work_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `work_record_owner` ON `work_records` (`seller_uid`,`work_id`,`state`,`sequence`);--> statement-breakpoint
CREATE TRIGGER work_records_no_committed_update BEFORE UPDATE ON work_records WHEN OLD.state='committed' BEGIN SELECT RAISE(ABORT,'Committed registration records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER work_records_no_committed_delete BEFORE DELETE ON work_records WHEN OLD.state='committed' BEGIN SELECT RAISE(ABORT,'Committed registration records are immutable'); END;
