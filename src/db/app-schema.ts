import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user, oauthApplication } from "./auth-schema";

// ========================================
// Access Control Tables
// ========================================

// User-to-Client Access Control
export const userClientAccess = sqliteTable(
  "user_client_access",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull(), // 'use' | 'admin'
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    expiresAt: integer("expires_at", { mode: "timestamp" }), // Optional expiration
  },
  (table) => [
    index("user_client_access_user_id_idx").on(table.userId),
    index("user_client_access_client_id_idx").on(table.clientId),
    index("user_client_access_unique_idx").on(table.userId, table.clientId),
  ]
);

// User Group
export const userGroup = sqliteTable("user_group", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Group Membership
export const groupMembership = sqliteTable(
  "group_membership",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => userGroup.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("group_membership_user_id_idx").on(table.userId),
    index("group_membership_group_id_idx").on(table.groupId),
    index("group_membership_unique_idx").on(table.userId, table.groupId),
  ]
);

// Group-to-Client Access Control
export const groupClientAccess = sqliteTable(
  "group_client_access",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => userGroup.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    accessLevel: text("access_level").notNull(), // 'use' | 'admin'
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("group_client_access_group_id_idx").on(table.groupId),
    index("group_client_access_client_id_idx").on(table.clientId),
    index("group_client_access_unique_idx").on(table.groupId, table.clientId),
  ]
);

// OAuth Client Extended Metadata
// Store additional OAuth client configuration that extends the Better Auth schema
export const oauthClientMetadata = sqliteTable(
  "oauth_client_metadata",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .unique()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    allowedResources: text("allowed_resources"), // JSON: { "projects": ["read","write"] }
    allowsApiKeys: integer("allows_api_keys", { mode: "boolean" }).notNull().default(false),
    defaultApiKeyPermissions: text("default_api_key_permissions"), // JSON: { "projects": ["read"] }
    grantProjectionClientIds: text("grant_projection_client_ids").notNull().default("[]"),
    accessPolicy: text("access_policy").notNull().default("all_users"), // 'all_users' | 'restricted'
    // Whether this client can create registration contexts
    // Must be enabled by platform admin before client can create sign-up flows
    allowsRegistrationContexts: integer("allows_registration_contexts", {
      mode: "boolean",
    })
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("oauth_client_metadata_client_id_idx").on(table.clientId),
  ]
);

// Resource Server - API/backend audience that consumes access tokens.
// This is intentionally separate from OAuth clients.
export const resourceServers = sqliteTable(
  "resource_servers",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    audience: text("audience").notNull().unique(),
    description: text("description"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("resource_servers_slug_idx").on(table.slug),
    index("resource_servers_audience_idx").on(table.audience),
  ]
);

// Authorization Space - first-class ownership boundary for models and grants.
export const authorizationSpaces = sqliteTable(
  "authorization_spaces",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    resourceServerId: text("resource_server_id").references(() => resourceServers.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("authorization_spaces_slug_idx").on(table.slug),
    index("authorization_spaces_resource_server_id_idx").on(table.resourceServerId),
  ]
);

// OAuth Client to Authorization Space link. OAuth clients remain OAuth clients;
// this table describes which authorization spaces they can participate in.
export const oauthClientSpaceLinks = sqliteTable(
  "oauth_client_space_links",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    authorizationSpaceId: text("authorization_space_id")
      .notNull()
      .references(() => authorizationSpaces.id, { onDelete: "cascade" }),
    accessMode: text("access_mode").notNull().default("login_only"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("oauth_client_space_links_client_id_idx").on(table.clientId),
    index("oauth_client_space_links_space_id_idx").on(table.authorizationSpaceId),
    uniqueIndex("oauth_client_space_links_client_space_unique").on(
      table.clientId,
      table.authorizationSpaceId
    ),
  ]
);

// ========================================
// Webhook Tables
// ========================================

// Webhook Endpoint - A single destination where notifications are sent
export const webhookEndpoint = sqliteTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Optional client scope filter: when set, only deliver events belonging to this client.
    // When null, deliver all events regardless of client (platform-wide).
    clientId: text("client_id")
      .references(() => oauthApplication.clientId, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    url: text("url"), // Nullable - webhooks can be created without URL (pending setup)
    encryptedSecret: text("encrypted_secret").notNull(), // Store encrypted webhook signing secret
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    retryPolicy: text("retry_policy").notNull().default("standard"), // e.g., "none", "standard", "aggressive"
    deliveryFormat: text("delivery_format").notNull().default("json"), // "json" or "form-encoded"
    requestMethod: text("request_method").notNull().default("POST"), // "POST", "PUT", etc.
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("webhook_endpoint_user_id_idx").on(table.userId)]
);

// Webhook Subscription - Which event types each endpoint wants to receive
export const webhookSubscription = sqliteTable(
  "webhook_subscription",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // e.g., "order.created", "user.updated"
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("webhook_subscription_endpoint_id_idx").on(table.endpointId),
    // Unique constraint: an endpoint can only subscribe to each event type once
    index("webhook_subscription_endpoint_event_unique").on(
      table.endpointId,
      table.eventType
    ),
  ]
);

// Webhook Event - A record that an event happened in the system
export const webhookEvent = sqliteTable(
  "webhook_event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g., "order.created", "user.updated"
    payload: text("payload", { mode: "json" }).notNull(), // JSON snapshot of the event data
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("webhook_event_user_id_idx").on(table.userId),
    index("webhook_event_type_idx").on(table.type),
    index("webhook_event_created_at_idx").on(table.createdAt),
  ]
);

// Webhook Delivery - A specific attempt to send one event to one endpoint
export const webhookDelivery = sqliteTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => webhookEvent.id, { onDelete: "cascade" }),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // "pending", "success", "failed", "retrying", "dead"
    attemptCount: integer("attempt_count").notNull().default(0),
    responseCode: integer("response_code"), // HTTP status code (200, 500, 404, etc.)
    responseBody: text("response_body"), // Trimmed response for debugging
    durationMs: integer("duration_ms"), // Request duration in milliseconds
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("webhook_delivery_event_id_idx").on(table.eventId),
    index("webhook_delivery_endpoint_id_idx").on(table.endpointId),
    index("webhook_delivery_status_idx").on(table.status),
    index("webhook_delivery_created_at_idx").on(table.createdAt),
  ]
);
