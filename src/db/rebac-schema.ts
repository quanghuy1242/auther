import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const accessTuples = sqliteTable(
  "access_tuples",
  {
    id: text("id").primaryKey(),
    // Entity (The object being accessed)
    entityType: text("entity_type").notNull(), // e.g., 'oauth_client', 'invoice', 'webhook'
    entityId: text("entity_id").notNull(), // Can be specific ID (e.g., 'client_123') or "*" for wildcard

    // Relation (The access level/role)
    relation: text("relation").notNull(), // e.g., 'owner', 'admin', 'viewer', 'edit'

    // Subject (The actor requesting access)
    subjectType: text("subject_type").notNull(), // 'user', 'group', 'apikey'
    subjectId: text("subject_id").notNull(), // The ID of the user, group, or api key

    // Optional: if the subject is a set (e.g. 'group:admins#member') - standard Zanzibar pattern
    subjectRelation: text("subject_relation"),

    // Optional: Lua script for per-grant ABAC conditions
    condition: text("condition"),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    // Optimize for common lookups:
    // 1. "Can Subject S perform Action R on Entity E?" -> (entity, relation, subject)
    index("access_tuples_entity_relation_subject_idx").on(
      table.entityType,
      table.entityId,
      table.relation,
      table.subjectType,
      table.subjectId
    ),
    // 2. "What permissions does Subject S have?" -> (subject)
    index("access_tuples_subject_idx").on(table.subjectType, table.subjectId),
    // 3. "Who has permission R on Entity E?" -> (entity, relation)
    index("access_tuples_entity_relation_idx").on(table.entityType, table.entityId, table.relation),
    // 4. Reverse lookup (often needed for graph traversal): "What entities does this subject have relation R on?"
    index("access_tuples_reverse_idx").on(table.subjectType, table.subjectId, table.relation),
  ]
);

/**
 * Stores the configuration for ReBAC models.
 * 
 * @example
 * // JSON Definition Structure for 'invoice' entity
 * {
 *   "relations": {
 *     "owner": [],
 *     "editor": ["owner"],     // owner implies editor
 *     "viewer": ["editor"]     // editor implies viewer
 *   },
 *   "permissions": {
 *     "read": {
 *       "relation": "viewer"   // anyone with 'viewer' relation can read
 *     },
 *     "delete": {
 *       "relation": "owner"
 *     },
 *     "refund": {
 *       "relation": "admin",
 *       "policyEngine": "lua", // Optional: ABAC policy
 *       "policy": "if context.resource.amount < 1000 then return true else return false end"
 *     }
 *   }
 * }
 */
export const authorizationModels = sqliteTable(
  "authorization_models",
  {
    id: text("id").primaryKey(),
    // The entity type this model describes (e.g., "oauth_client", "invoice")
    entityType: text("entity_type").notNull().unique(),
    // JSON definition of relations and permissions
    definition: text("definition", { mode: "json" }).notNull(),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("authorization_models_entity_type_idx").on(table.entityType),
  ]
);
