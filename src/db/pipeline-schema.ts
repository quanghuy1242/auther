import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Stores re-usable Lua scripts (Logic layer)
 */
export const pipelineScripts = sqliteTable("pipeline_scripts", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull(), // The Lua source
    config: text("config"), // JSON: Default variables
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

/**
 * Stores the optimized execution path for runtime (Runtime layer)
 * Derived from the graph.
 */
export const pipelineExecutionPlan = sqliteTable("pipeline_execution_plan", {
    id: text("id").primaryKey(),
    triggerEvent: text("trigger_event").notNull().unique(), // e.g., 'before_signup'
    nodeOrder: text("node_order").notNull(), // JSON: string[][] (Layers of ScriptIDs for DAG execution)
    createdAt: integer("created_at", { mode: "timestamp_ms" })
        .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
        .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

/**
 * Stores the React Flow graph state (Layout layer)
 * Single row 'default' for single-tenant system.
 */
export const pipelineGraph = sqliteTable("pipeline_graph", {
    id: text("id").primaryKey(), // 'default'
    nodes: text("nodes").notNull(), // JSON: [{ id: "node_1", data: { scriptId: "script_A" }, position: {x,y} }]
    edges: text("edges").notNull(), // JSON: [{ source: "trigger_signup", target: "node_1" }]
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .$onUpdate(() => /* @__PURE__ */ new Date())
        .notNull(),
});

// =============================================================================
// OBSERVABILITY: OpenTelemetry-Compatible Tracing
// =============================================================================

/**
 * Pipeline Traces - One per trigger execution
 * OTEL-compatible: trace_id, timestamps, status
 */
export const pipelineTraces = sqliteTable(
    "pipeline_traces",
    {
        // OTEL: trace_id (UUID serves as 16-byte trace ID)
        id: text("id").primaryKey(),

        // Pipeline-specific
        triggerEvent: text("trigger_event").notNull(), // "before_signin"

        // OTEL: status
        status: text("status").notNull(), // "success" | "blocked" | "error"
        statusMessage: text("status_message"), // Error details if any

        // OTEL: timestamps (Unix ms)
        startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
        endedAt: integer("ended_at", { mode: "timestamp_ms" }),
        durationMs: integer("duration_ms"),

        // Context
        userId: text("user_id"), // Who triggered (if known)
        requestIp: text("request_ip"),
        contextSnapshot: text("context_snapshot"), // JSON: input context
        resultData: text("result_data"), // JSON: merged output

        // Housekeeping
        createdAt: integer("created_at", { mode: "timestamp_ms" })
            .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
            .notNull(),
    },
    (table) => [
        index("idx_traces_trigger").on(table.triggerEvent),
        index("idx_traces_status").on(table.status),
        index("idx_traces_created").on(table.createdAt),
    ]
);

/**
 * Pipeline Spans - One per script execution within a trace
 * OTEL-compatible: span_id, trace_id, parent_span_id, kind, status
 */
export const pipelineSpans = sqliteTable(
    "pipeline_spans",
    {
        // OTEL: span_id (UUID serves as 8-byte span ID)
        id: text("id").primaryKey(),

        // OTEL: trace_id reference
        traceId: text("trace_id").notNull(),

        // OTEL: parent_span_id (for future fan-in tracking)
        parentSpanId: text("parent_span_id"),

        // OTEL: name
        name: text("name").notNull(), // Script name: "Geo Blocker"

        // OTEL: kind (all INTERNAL for pipeline scripts)
        kind: text("kind").notNull().default("INTERNAL"),

        // Pipeline-specific
        scriptId: text("script_id").notNull(),
        layerIndex: integer("layer_index").notNull(), // 0, 1, 2...
        parallelIndex: integer("parallel_index").notNull(), // Position within layer

        // OTEL: status
        status: text("status").notNull(), // "success" | "blocked" | "error" | "skipped"
        statusMessage: text("status_message"),

        // OTEL: timestamps
        startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
        endedAt: integer("ended_at", { mode: "timestamp_ms" }),
        durationMs: integer("duration_ms"),

        // OTEL: attributes (as JSON)
        attributes: text("attributes"), // JSON: { input_context, output_data }
    },
    (table) => [
        index("idx_spans_trace").on(table.traceId),
        index("idx_spans_script").on(table.scriptId),
    ]
);
