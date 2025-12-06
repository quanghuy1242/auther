import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * ABAC Audit Logs - Records policy evaluations for debugging and compliance.
 */
export const abacAuditLogs = sqliteTable(
    "abac_audit_logs",
    {
        id: text("id").primaryKey(),

        // What was evaluated
        entityType: text("entity_type").notNull(),
        entityId: text("entity_id").notNull(),
        permission: text("permission").notNull(),

        // Who requested
        subjectType: text("subject_type").notNull(), // 'user', 'group', 'apikey'
        subjectId: text("subject_id").notNull(),

        // Policy details
        policySource: text("policy_source").notNull(), // 'tuple' | 'permission'
        policyScript: text("policy_script"), // The actual Lua script evaluated

        // Evaluation result
        result: text("result").notNull(), // 'allowed' | 'denied' | 'error'
        errorMessage: text("error_message"), // If result is 'error'

        // Context snapshot (for debugging)
        contextSnapshot: text("context_snapshot", { mode: "json" }), // JSON of context at evaluation time

        // Performance
        executionTimeMs: integer("execution_time_ms"),

        // Request metadata
        requestIp: text("request_ip"),
        requestUserAgent: text("request_user_agent"),

        createdAt: integer("created_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        // Query by entity
        index("abac_audit_entity_idx").on(table.entityType, table.entityId),
        // Query by subject
        index("abac_audit_subject_idx").on(table.subjectType, table.subjectId),
        // Query by result (find failures)
        index("abac_audit_result_idx").on(table.result),
        // Query by time (recent logs)
        index("abac_audit_time_idx").on(table.createdAt),
    ]
);

/**
 * Policy Version History - Tracks changes to policies over time.
 */
export const policyVersions = sqliteTable(
    "policy_versions",
    {
        id: text("id").primaryKey(),

        // Which policy
        entityType: text("entity_type").notNull(), // e.g., 'client_123:invoice'
        permissionName: text("permission_name").notNull(), // e.g., 'refund'
        policyLevel: text("policy_level").notNull(), // 'permission' | 'tuple'
        tupleId: text("tuple_id"), // Only for tuple-level policies

        // Policy content
        policyScript: text("policy_script").notNull(),

        // Version info
        version: integer("version").notNull(),

        // Who made the change
        changedByType: text("changed_by_type"), // 'user' | 'system'
        changedById: text("changed_by_id"),
        changeReason: text("change_reason"), // Optional description

        createdAt: integer("created_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        // Query by entity + permission
        index("policy_versions_entity_perm_idx").on(table.entityType, table.permissionName),
        // Query by tuple
        index("policy_versions_tuple_idx").on(table.tupleId),
        // Query versions by time
        index("policy_versions_time_idx").on(table.createdAt),
    ]
);
