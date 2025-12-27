import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * Metrics - Unified internal metrics collection table
 *
 * Stores system and user-defined metrics with tags for dimensions.
 * See docs/metrics_system_plan.md for full specification.
 */
export const metrics = sqliteTable(
    "metrics",
    {
        id: text("id").primaryKey(), // UUID/CUID
        name: text("name").notNull(), // Dot-notation: http.request.duration_ms
        value: real("value").notNull(), // Numeric value (latency, count, gauge)
        tags: text("tags", { mode: "json" }).$type<Record<string, string>>(), // Dimensions as JSON
        metricType: text("metric_type").notNull().default("system"), // 'system' | 'user'
        timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
            .notNull(),
    },
    (table) => [
        index("idx_metrics_name").on(table.name),
        index("idx_metrics_timestamp").on(table.timestamp),
        index("idx_metrics_type").on(table.metricType),
    ]
);

// Type exports for use in repository/service
export type MetricEntity = typeof metrics.$inferSelect;
export type CreateMetricData = typeof metrics.$inferInsert;
