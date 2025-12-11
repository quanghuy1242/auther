CREATE TABLE `pipeline_spans` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'INTERNAL' NOT NULL,
	`script_id` text NOT NULL,
	`layer_index` integer NOT NULL,
	`parallel_index` integer NOT NULL,
	`status` text NOT NULL,
	`status_message` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer,
	`attributes` text
);
--> statement-breakpoint
CREATE INDEX `idx_spans_trace` ON `pipeline_spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `idx_spans_script` ON `pipeline_spans` (`script_id`);--> statement-breakpoint
CREATE TABLE `pipeline_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger_event` text NOT NULL,
	`status` text NOT NULL,
	`status_message` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_ms` integer,
	`user_id` text,
	`request_ip` text,
	`context_snapshot` text,
	`result_data` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_traces_trigger` ON `pipeline_traces` (`trigger_event`);--> statement-breakpoint
CREATE INDEX `idx_traces_status` ON `pipeline_traces` (`status`);--> statement-breakpoint
CREATE INDEX `idx_traces_created` ON `pipeline_traces` (`created_at`);