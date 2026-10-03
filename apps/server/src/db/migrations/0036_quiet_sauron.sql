CREATE TABLE `watch_library` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` integer NOT NULL,
	`added_by_user_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_library_file_id_unique` ON `watch_library` (`file_id`);--> statement-breakpoint
CREATE INDEX `watch_library_file_idx` ON `watch_library` (`file_id`);--> statement-breakpoint
ALTER TABLE `settings` ADD `watch_library_locked` integer DEFAULT true NOT NULL;