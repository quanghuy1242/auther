CREATE TABLE `abac_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`permission` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`policy_source` text NOT NULL,
	`policy_script` text,
	`result` text NOT NULL,
	`error_message` text,
	`context_snapshot` text,
	`execution_time_ms` integer,
	`request_ip` text,
	`request_user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `abac_audit_entity_idx` ON `abac_audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `abac_audit_subject_idx` ON `abac_audit_logs` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `abac_audit_result_idx` ON `abac_audit_logs` (`result`);--> statement-breakpoint
CREATE INDEX `abac_audit_time_idx` ON `abac_audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`permission_name` text NOT NULL,
	`policy_level` text NOT NULL,
	`tuple_id` text,
	`policy_script` text NOT NULL,
	`version` integer NOT NULL,
	`changed_by_type` text,
	`changed_by_id` text,
	`change_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `policy_versions_entity_perm_idx` ON `policy_versions` (`entity_type`,`permission_name`);--> statement-breakpoint
CREATE INDEX `policy_versions_tuple_idx` ON `policy_versions` (`tuple_id`);--> statement-breakpoint
CREATE INDEX `policy_versions_time_idx` ON `policy_versions` (`created_at`);