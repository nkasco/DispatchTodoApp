CREATE TABLE `security_setting` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`databaseEncryptionEnabled` integer DEFAULT false NOT NULL,
	`updatedAt` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `frozenAt` text;