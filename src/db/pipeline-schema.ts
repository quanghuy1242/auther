import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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


