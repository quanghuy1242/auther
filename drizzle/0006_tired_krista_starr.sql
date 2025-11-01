PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_group_client_access` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`client_id` text NOT NULL,
	`access_level` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `user_group`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_group_client_access`("id", "group_id", "client_id", "access_level", "created_at", "updated_at") SELECT "id", "group_id", "client_id", "access_level", "created_at", "updated_at" FROM `group_client_access`;--> statement-breakpoint
DROP TABLE `group_client_access`;--> statement-breakpoint
ALTER TABLE `__new_group_client_access` RENAME TO `group_client_access`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `group_client_access_group_id_idx` ON `group_client_access` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_client_access_client_id_idx` ON `group_client_access` (`client_id`);--> statement-breakpoint
CREATE INDEX `group_client_access_unique_idx` ON `group_client_access` (`group_id`,`client_id`);