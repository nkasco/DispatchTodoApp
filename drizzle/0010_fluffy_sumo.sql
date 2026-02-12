CREATE TABLE `ai_config` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`apiKey` text,
	`baseUrl` text,
	`model` text DEFAULT 'gpt-4o-mini' NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL,
	`updatedAt` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_config_userId_idx` ON `ai_config` (`userId`);--> statement-breakpoint
CREATE INDEX `ai_config_active_idx` ON `ai_config` (`userId`,`isActive`);--> statement-breakpoint
CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text DEFAULT 'New conversation' NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL,
	`updatedAt` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_conversation_userId_idx` ON `chat_conversations` (`userId`);--> statement-breakpoint
CREATE INDEX `chat_conversation_updatedAt_idx` ON `chat_conversations` (`updatedAt`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`model` text,
	`tokenCount` integer,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_message_conversationId_idx` ON `chat_messages` (`conversationId`);--> statement-breakpoint
CREATE INDEX `chat_message_createdAt_idx` ON `chat_messages` (`createdAt`);--> statement-breakpoint
ALTER TABLE `user` ADD `assistantEnabled` integer DEFAULT true NOT NULL;
