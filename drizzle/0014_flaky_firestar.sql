PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_webhook_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`url` text,
	`encrypted_secret` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`retry_policy` text DEFAULT 'standard' NOT NULL,
	`delivery_format` text DEFAULT 'json' NOT NULL,
	`request_method` text DEFAULT 'POST' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_webhook_endpoint`("id", "user_id", "display_name", "url", "encrypted_secret", "is_active", "retry_policy", "delivery_format", "request_method", "created_at", "updated_at") SELECT "id", "user_id", "display_name", "url", "encrypted_secret", "is_active", "retry_policy", "delivery_format", "request_method", "created_at", "updated_at" FROM `webhook_endpoint`;--> statement-breakpoint
DROP TABLE `webhook_endpoint`;--> statement-breakpoint
ALTER TABLE `__new_webhook_endpoint` RENAME TO `webhook_endpoint`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `webhook_endpoint_user_id_idx` ON `webhook_endpoint` (`user_id`);