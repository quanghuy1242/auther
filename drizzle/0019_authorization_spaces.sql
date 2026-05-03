CREATE TABLE `resource_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`audience` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_servers_slug_unique` ON `resource_servers` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `resource_servers_audience_unique` ON `resource_servers` (`audience`);--> statement-breakpoint
CREATE INDEX `resource_servers_slug_idx` ON `resource_servers` (`slug`);--> statement-breakpoint
CREATE INDEX `resource_servers_audience_idx` ON `resource_servers` (`audience`);--> statement-breakpoint
CREATE TABLE `authorization_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`resource_server_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`resource_server_id`) REFERENCES `resource_servers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authorization_spaces_slug_unique` ON `authorization_spaces` (`slug`);--> statement-breakpoint
CREATE INDEX `authorization_spaces_slug_idx` ON `authorization_spaces` (`slug`);--> statement-breakpoint
CREATE INDEX `authorization_spaces_resource_server_id_idx` ON `authorization_spaces` (`resource_server_id`);--> statement-breakpoint
CREATE TABLE `oauth_client_space_links` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`authorization_space_id` text NOT NULL,
	`access_mode` text DEFAULT 'login_only' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`authorization_space_id`) REFERENCES `authorization_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_client_space_links_client_id_idx` ON `oauth_client_space_links` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_space_links_space_id_idx` ON `oauth_client_space_links` (`authorization_space_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_space_links_client_space_unique` ON `oauth_client_space_links` (`client_id`,`authorization_space_id`);--> statement-breakpoint
ALTER TABLE `authorization_models` ADD `authorization_space_id` text REFERENCES authorization_spaces(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `authorization_models_space_id_idx` ON `authorization_models` (`authorization_space_id`);
