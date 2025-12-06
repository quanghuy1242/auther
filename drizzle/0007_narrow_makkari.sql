CREATE TABLE `access_tuples` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`relation` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_relation` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_tuples_entity_relation_subject_idx` ON `access_tuples` (`entity_type`,`entity_id`,`relation`,`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `access_tuples_subject_idx` ON `access_tuples` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `access_tuples_entity_relation_idx` ON `access_tuples` (`entity_type`,`entity_id`,`relation`);--> statement-breakpoint
CREATE INDEX `access_tuples_reverse_idx` ON `access_tuples` (`subject_type`,`subject_id`,`relation`);--> statement-breakpoint
CREATE TABLE `authorization_models` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`definition` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authorization_models_entity_type_unique` ON `authorization_models` (`entity_type`);--> statement-breakpoint
CREATE INDEX `authorization_models_entity_type_idx` ON `authorization_models` (`entity_type`);