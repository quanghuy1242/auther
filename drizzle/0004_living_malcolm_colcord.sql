CREATE TABLE `apikey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_time_window` integer DEFAULT 86400000,
	`rate_limit_max` integer DEFAULT 10,
	`request_count` integer DEFAULT 0,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`permissions` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_client_access` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`client_id` text NOT NULL,
	`access_level` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `user_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_client_access_group_id_idx` ON `group_client_access` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_client_access_client_id_idx` ON `group_client_access` (`client_id`);--> statement-breakpoint
CREATE INDEX `group_client_access_unique_idx` ON `group_client_access` (`group_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `group_membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `user_group`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_membership_user_id_idx` ON `group_membership` (`user_id`);--> statement-breakpoint
CREATE INDEX `group_membership_group_id_idx` ON `group_membership` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_membership_unique_idx` ON `group_membership` (`user_id`,`group_id`);--> statement-breakpoint
CREATE TABLE `oauth_client_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`allowed_resources` text,
	`allows_api_keys` integer DEFAULT false NOT NULL,
	`default_api_key_permissions` text,
	`access_policy` text DEFAULT 'all_users' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_metadata_client_id_unique` ON `oauth_client_metadata` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_metadata_client_id_idx` ON `oauth_client_metadata` (`client_id`);--> statement-breakpoint
CREATE TABLE `user_client_access` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`access_level` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_client_access_user_id_idx` ON `user_client_access` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_client_access_client_id_idx` ON `user_client_access` (`client_id`);--> statement-breakpoint
CREATE INDEX `user_client_access_unique_idx` ON `user_client_access` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `user_group` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_group_name_unique` ON `user_group` (`name`);