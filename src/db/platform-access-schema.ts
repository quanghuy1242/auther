import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { oauthApplication } from "./auth-schema";

// ========================================
// Registration Contexts
// ========================================

/**
 * Registration contexts define sign-up flows with automatic permission grants.
 * - Platform contexts (clientId = null): Grant platform permissions, allow admin access
 * - Client contexts (clientId set): Grant client-specific permissions only, no admin access
 */
export const registrationContexts = sqliteTable(
    "registration_contexts",
    {
        id: text("id").primaryKey(),
        slug: text("slug").notNull().unique(), // e.g., "blog-commenter", "platform-admin"
        name: text("name").notNull(),
        description: text("description"),

        // If set, this context is scoped to a specific client
        // Null = platform-level context (can grant platform permissions)
        clientId: text("client_id").references(() => oauthApplication.clientId, {
            onDelete: "cascade",
        }),

        // Source restrictions for open registration
        allowedOrigins: text("allowed_origins", { mode: "json" }).$type<string[]>(), // ["https://blog.example.com"]
        allowedDomains: text("allowed_domains", { mode: "json" }).$type<string[]>(), // Email domain restrictions

        // Grants: references to existing authorization model relations
        // Format: [{ relation: "commenter" }] for client contexts
        // Format: [{ entityType: "platform", relation: "member" }] for platform contexts
        grants: text("grants", { mode: "json" })
            .notNull()
            .$type<Array<{ entityType?: string; relation: string }>>(),

        enabled: integer("enabled", { mode: "boolean" }).default(true),

        createdAt: integer("created_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer("updated_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index("registration_contexts_slug_idx").on(table.slug),
        index("registration_contexts_client_id_idx").on(table.clientId),
    ]
);

// ========================================
// Platform Invites
// ========================================

/**
 * Signed invitation tokens for context-aware registration.
 * - One-time use (consumedAt marks as used)
 * - HMAC-signed to prevent tampering
 * - Optional email lock
 */
export const platformInvites = sqliteTable(
    "platform_invites",
    {
        id: text("id").primaryKey(),

        // Who created this invite
        invitedBy: text("invited_by")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),

        // Optional: lock to specific email
        email: text("email"),

        // Which registration context this invite uses
        contextSlug: text("context_slug")
            .notNull()
            .references(() => registrationContexts.slug),

        // Hash of the signed token for verification
        tokenHash: text("token_hash").notNull(),

        // Expiration
        expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),

        // One-time use tracking
        consumedAt: integer("consumed_at", { mode: "timestamp" }),
        consumedBy: text("consumed_by").references(() => user.id),

        createdAt: integer("created_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index("platform_invites_context_slug_idx").on(table.contextSlug),
        index("platform_invites_invited_by_idx").on(table.invitedBy),
        index("platform_invites_email_idx").on(table.email),
    ]
);

// ========================================
// Permission Requests
// ========================================

/**
 * Tracks permission escalation requests from users.
 * - Platform requests (clientId = null): Require platform admin approval
 * - Client requests (clientId set): Require client admin approval
 */
export const permissionRequests = sqliteTable(
    "permission_requests",
    {
        id: text("id").primaryKey(),

        // Who is requesting
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),

        // What they're requesting (null clientId = platform permission)
        clientId: text("client_id").references(() => oauthApplication.clientId, {
            onDelete: "cascade",
        }),
        relation: text("relation").notNull(), // The relation they want

        // Request details
        reason: text("reason"),
        status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"

        // Resolution
        resolvedBy: text("resolved_by").references(() => user.id),
        resolvedAt: integer("resolved_at", { mode: "timestamp" }),
        resolutionNote: text("resolution_note"),

        requestedAt: integer("requested_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index("permission_requests_user_id_idx").on(table.userId),
        index("permission_requests_client_id_idx").on(table.clientId),
        index("permission_requests_status_idx").on(table.status),
    ]
);

// ========================================
// Permission Rules
// ========================================

/**
 * Defines requestability and auto-approval conditions for permissions.
 * - Platform rules (clientId = null): Apply to platform permissions
 * - Client rules (clientId set): Apply to that client's permissions
 */
export const permissionRules = sqliteTable(
    "permission_rules",
    {
        id: text("id").primaryKey(),

        // Scope: null = platform rule, set = client-specific rule
        clientId: text("client_id").references(() => oauthApplication.clientId, {
            onDelete: "cascade",
        }),

        // Which relation this rule applies to
        relation: text("relation").notNull(),

        // Can users request this permission themselves?
        selfRequestable: integer("self_requestable", { mode: "boolean" }).default(
            false
        ),

        // Lua script for auto-approval condition (optional)
        // If returns true, request is auto-approved
        autoApproveCondition: text("auto_approve_condition"),

        // Lua script for auto-rejection condition (optional)
        // If returns true, request is auto-rejected
        autoRejectCondition: text("auto_reject_condition"),

        // Default action if no condition matches
        defaultAction: text("default_action").notNull().default("require_approval"), // "auto_approve" | "require_approval" | "auto_reject"

        // Which relation is required to approve requests for this permission
        approverRelation: text("approver_relation"),

        description: text("description"),

        createdAt: integer("created_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer("updated_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index("permission_rules_client_id_idx").on(table.clientId),
        index("permission_rules_relation_idx").on(table.relation),
    ]
);

// ========================================
// Policy Templates
// ========================================

/**
 * Reusable permission bundles for quick assignment.
 * Platform-level only (no clientId).
 */
export const policyTemplates = sqliteTable(
    "policy_templates",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        description: text("description"),

        // Category for organization
        category: text("category").notNull().default("custom"), // "platform" | "custom"

        // System templates cannot be deleted
        isSystem: integer("is_system", { mode: "boolean" }).default(false),

        // Permissions granted by this template
        // Format: [{ entityType: "webhooks", relation: "editor" }, ...]
        permissions: text("permissions", { mode: "json" })
            .notNull()
            .$type<Array<{ entityType: string; entityId?: string; relation: string }>>(),

        createdAt: integer("created_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer("updated_at", { mode: "timestamp" })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index("policy_templates_category_idx").on(table.category),
        index("policy_templates_is_system_idx").on(table.isSystem),
    ]
);
