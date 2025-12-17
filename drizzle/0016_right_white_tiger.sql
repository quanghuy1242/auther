PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_oauth_client_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`allowed_resources` text,
	`allows_api_keys` integer DEFAULT false NOT NULL,
	`default_api_key_permissions` text,
	`access_policy` text DEFAULT 'all_users' NOT NULL,
	`allows_registration_contexts` integer DEFAULT false,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_oauth_client_metadata`("id", "client_id", "allowed_resources", "allows_api_keys", "default_api_key_permissions", "access_policy", "allows_registration_contexts", "created_at", "updated_at") SELECT "id", "client_id", "allowed_resources", "allows_api_keys", "default_api_key_permissions", "access_policy", "allows_registration_contexts", "created_at", "updated_at" FROM `oauth_client_metadata`;--> statement-breakpoint
DROP TABLE `oauth_client_metadata`;--> statement-breakpoint
ALTER TABLE `__new_oauth_client_metadata` RENAME TO `oauth_client_metadata`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_metadata_client_id_unique` ON `oauth_client_metadata` (`client_id`);--> statement-breakpoint
CREATE INDEX `oauth_client_metadata_client_id_idx` ON `oauth_client_metadata` (`client_id`);