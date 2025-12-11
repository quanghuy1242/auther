CREATE TABLE `pipeline_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_secrets_name_unique` ON `pipeline_secrets` (`name`);