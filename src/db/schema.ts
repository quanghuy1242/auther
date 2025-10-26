import { randomUUID } from "node:crypto";

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const defaultId = () => randomUUID();
const now = () => new Date();

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_idx").on(table.email),
  }),
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_idx").on(table.token),
    userIdx: index("session_user_idx").on(table.userId),
  }),
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
  },
  (table) => ({
    providerAccountIdx: uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
    accountUserIdx: index("account_user_idx").on(table.userId),
  }),
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
  },
  (table) => ({
    identifierValueIdx: uniqueIndex("verification_identifier_value_idx").on(table.identifier, table.value),
  }),
);

export const oauthApplication = sqliteTable(
  "oauthApplication",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    name: text("name").notNull(),
    icon: text("icon"),
    metadata: text("metadata"),
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret"),
    redirectURLs: text("redirect_urls").notNull(),
    type: text("type").notNull(),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
  },
  (table) => ({
    clientIdIdx: uniqueIndex("oauth_application_client_id_idx").on(table.clientId),
  }),
);

export const oauthAccessToken = sqliteTable(
  "oauthAccessToken",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }).notNull(),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }).notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
  },
  (table) => ({
    accessTokenIdx: uniqueIndex("oauth_access_token_access_idx").on(table.accessToken),
    refreshTokenIdx: uniqueIndex("oauth_access_token_refresh_idx").on(table.refreshToken),
    oauthClientIdx: index("oauth_access_token_client_idx").on(table.clientId),
    oauthUserIdx: index("oauth_access_token_user_idx").on(table.userId),
  }),
);

export const oauthConsent = sqliteTable(
  "oauthConsent",
  {
    id: text("id").primaryKey().$defaultFn(defaultId),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
    consentGiven: integer("consent_given", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    consentIdx: uniqueIndex("oauth_consent_user_client_idx").on(table.userId, table.clientId),
  }),
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
