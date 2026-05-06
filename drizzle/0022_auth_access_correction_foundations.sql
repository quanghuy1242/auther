CREATE TABLE `authorization_model_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `authorization_model_id` text NOT NULL,
  `authorization_space_id` text NOT NULL,
  `alias_entity_type` text NOT NULL,
  `canonical_entity_type` text NOT NULL,
  `source` text DEFAULT 'legacy_client_prefix' NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `retired_at` integer,
  FOREIGN KEY (`authorization_model_id`) REFERENCES `authorization_models`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`authorization_space_id`) REFERENCES `authorization_spaces`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `authorization_model_aliases_model_idx` ON `authorization_model_aliases` (`authorization_model_id`);--> statement-breakpoint
CREATE INDEX `authorization_model_aliases_space_idx` ON `authorization_model_aliases` (`authorization_space_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `authorization_model_aliases_space_alias_unique` ON `authorization_model_aliases` (`authorization_space_id`, `alias_entity_type`);--> statement-breakpoint
ALTER TABLE `registration_contexts` ADD `trigger_kind` text DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE `registration_contexts` ADD `trigger_client_id` text;--> statement-breakpoint
ALTER TABLE `registration_contexts` ADD `target_kind` text DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE `registration_contexts` ADD `target_id` text DEFAULT '*';--> statement-breakpoint
CREATE INDEX `registration_contexts_trigger_idx` ON `registration_contexts` (`trigger_kind`, `trigger_client_id`);--> statement-breakpoint
CREATE INDEX `registration_contexts_target_idx` ON `registration_contexts` (`target_kind`, `target_id`);--> statement-breakpoint
CREATE TABLE `pending_registration_context_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `user_id` text,
  `context_slug` text NOT NULL,
  `invite_id` text,
  `trigger_kind` text DEFAULT 'manual' NOT NULL,
  `trigger_client_id` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `last_error` text,
  `idempotency_key` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  `applied_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`context_slug`) REFERENCES `registration_contexts`(`slug`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`invite_id`) REFERENCES `platform_invites`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`trigger_client_id`) REFERENCES `oauth_application`(`client_id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `pending_context_applications_email_idx` ON `pending_registration_context_applications` (`email`);--> statement-breakpoint
CREATE INDEX `pending_context_applications_user_id_idx` ON `pending_registration_context_applications` (`user_id`);--> statement-breakpoint
CREATE INDEX `pending_context_applications_status_idx` ON `pending_registration_context_applications` (`status`);--> statement-breakpoint
CREATE INDEX `pending_context_applications_context_slug_idx` ON `pending_registration_context_applications` (`context_slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `pending_registration_context_applications_idempotency_key_unique` ON `pending_registration_context_applications` (`idempotency_key`);--> statement-breakpoint
ALTER TABLE `permission_requests` ADD `request_kind` text DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE `permission_requests` ADD `target_kind` text DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE `permission_requests` ADD `target_id` text DEFAULT '*';--> statement-breakpoint
ALTER TABLE `permission_requests` ADD `target_entity_type_id` text;--> statement-breakpoint
ALTER TABLE `permission_requests` ADD `target_entity_id` text;--> statement-breakpoint
CREATE INDEX `permission_requests_target_idx` ON `permission_requests` (`target_kind`, `target_id`);--> statement-breakpoint
ALTER TABLE `permission_rules` ADD `trigger_kind` text DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE `permission_rules` ADD `trigger_client_id` text;--> statement-breakpoint
ALTER TABLE `permission_rules` ADD `target_kind` text DEFAULT 'platform';--> statement-breakpoint
ALTER TABLE `permission_rules` ADD `target_id` text DEFAULT '*';--> statement-breakpoint
CREATE INDEX `permission_rules_trigger_idx` ON `permission_rules` (`trigger_kind`, `trigger_client_id`);--> statement-breakpoint
CREATE INDEX `permission_rules_target_idx` ON `permission_rules` (`target_kind`, `target_id`);--> statement-breakpoint
UPDATE `registration_contexts`
SET
  `trigger_kind` = CASE WHEN `client_id` IS NULL THEN 'platform' ELSE 'oauth_client' END,
  `trigger_client_id` = `client_id`,
  `target_kind` = CASE WHEN `client_id` IS NULL THEN 'platform' ELSE 'oauth_client_login' END,
  `target_id` = COALESCE(`client_id`, '*')
WHERE `trigger_kind` IS NULL OR `target_kind` IS NULL;--> statement-breakpoint
UPDATE `permission_requests`
SET
  `request_kind` = CASE WHEN `client_id` IS NULL THEN 'platform' ELSE 'legacy_client' END,
  `target_kind` = CASE WHEN `client_id` IS NULL THEN 'platform' ELSE 'legacy_client' END,
  `target_id` = COALESCE(`client_id`, '*')
WHERE `request_kind` IS NULL OR `target_kind` IS NULL;--> statement-breakpoint
UPDATE `permission_rules`
SET
  `trigger_kind` = CASE WHEN `client_id` IS NULL THEN 'platform' ELSE 'oauth_client' END,
  `trigger_client_id` = `client_id`,
  `target_kind` = CASE WHEN `client_id` IS NULL THEN 'platform' ELSE 'legacy_client' END,
  `target_id` = COALESCE(`client_id`, '*')
WHERE `trigger_kind` IS NULL OR `target_kind` IS NULL;
