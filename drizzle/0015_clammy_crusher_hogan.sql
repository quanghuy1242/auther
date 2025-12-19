CREATE TABLE `permission_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`relation` text NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`resolution_note` text,
	`requested_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `permission_requests_user_id_idx` ON `permission_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `permission_requests_client_id_idx` ON `permission_requests` (`client_id`);--> statement-breakpoint
CREATE INDEX `permission_requests_status_idx` ON `permission_requests` (`status`);--> statement-breakpoint
CREATE TABLE `permission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`relation` text NOT NULL,
	`self_requestable` integer DEFAULT false,
	`auto_approve_condition` text,
	`auto_reject_condition` text,
	`default_action` text DEFAULT 'require_approval' NOT NULL,
	`approver_relation` text,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `permission_rules_client_id_idx` ON `permission_rules` (`client_id`);--> statement-breakpoint
CREATE INDEX `permission_rules_relation_idx` ON `permission_rules` (`relation`);--> statement-breakpoint
CREATE TABLE `platform_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`invited_by` text NOT NULL,
	`email` text,
	`context_slug` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_slug`) REFERENCES `registration_contexts`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`consumed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `platform_invites_context_slug_idx` ON `platform_invites` (`context_slug`);--> statement-breakpoint
CREATE INDEX `platform_invites_invited_by_idx` ON `platform_invites` (`invited_by`);--> statement-breakpoint
CREATE INDEX `platform_invites_email_idx` ON `platform_invites` (`email`);--> statement-breakpoint
CREATE TABLE `policy_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'custom' NOT NULL,
	`is_system` integer DEFAULT false,
	`permissions` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policy_templates_category_idx` ON `policy_templates` (`category`);--> statement-breakpoint
CREATE INDEX `policy_templates_is_system_idx` ON `policy_templates` (`is_system`);--> statement-breakpoint
CREATE TABLE `registration_contexts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`client_id` text,
	`allowed_origins` text,
	`allowed_domains` text,
	`grants` text NOT NULL,
	`enabled` integer DEFAULT true,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contexts_slug_unique` ON `registration_contexts` (`slug`);--> statement-breakpoint
CREATE INDEX `registration_contexts_slug_idx` ON `registration_contexts` (`slug`);--> statement-breakpoint
CREATE INDEX `registration_contexts_client_id_idx` ON `registration_contexts` (`client_id`);--> statement-breakpoint
ALTER TABLE `oauth_client_metadata` ADD `allows_registration_contexts` integer DEFAULT false NOT NULL;