CREATE TABLE `webhook_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`endpoint_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`response_code` integer,
	`response_body` text,
	`duration_ms` integer,
	`last_attempt_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `webhook_event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoint`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_delivery_event_id_idx` ON `webhook_delivery` (`event_id`);--> statement-breakpoint
CREATE INDEX `webhook_delivery_endpoint_id_idx` ON `webhook_delivery` (`endpoint_id`);--> statement-breakpoint
CREATE INDEX `webhook_delivery_status_idx` ON `webhook_delivery` (`status`);--> statement-breakpoint
CREATE INDEX `webhook_delivery_created_at_idx` ON `webhook_delivery` (`created_at`);--> statement-breakpoint
CREATE TABLE `webhook_endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`url` text NOT NULL,
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
CREATE INDEX `webhook_endpoint_user_id_idx` ON `webhook_endpoint` (`user_id`);--> statement-breakpoint
CREATE TABLE `webhook_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_event_user_id_idx` ON `webhook_event` (`user_id`);--> statement-breakpoint
CREATE INDEX `webhook_event_type_idx` ON `webhook_event` (`type`);--> statement-breakpoint
CREATE INDEX `webhook_event_created_at_idx` ON `webhook_event` (`created_at`);--> statement-breakpoint
CREATE TABLE `webhook_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
	`event_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoint`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_subscription_endpoint_id_idx` ON `webhook_subscription` (`endpoint_id`);--> statement-breakpoint
CREATE INDEX `webhook_subscription_endpoint_event_unique` ON `webhook_subscription` (`endpoint_id`,`event_type`);