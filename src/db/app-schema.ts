import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// Webhook Endpoint - A single destination where notifications are sent
export const webhookEndpoint = sqliteTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    url: text("url").notNull(),
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
