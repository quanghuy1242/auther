CREATE TABLE `pipeline_execution_plan` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger_event` text NOT NULL,
	`node_order` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pipeline_execution_plan_trigger_event_unique` ON `pipeline_execution_plan` (`trigger_event`);--> statement-breakpoint
CREATE TABLE `pipeline_graph` (
	`id` text PRIMARY KEY NOT NULL,
	`nodes` text NOT NULL,
	`edges` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pipeline_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`config` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL
);
