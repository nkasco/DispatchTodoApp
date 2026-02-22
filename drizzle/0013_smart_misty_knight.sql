ALTER TABLE `security_setting` ADD `userRegistrationEnabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `recurrenceType` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `recurrenceRule` text;