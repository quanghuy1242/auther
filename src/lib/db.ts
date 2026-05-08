import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/env";
import * as schema from "@/db/schema";

const DATABASE_ERROR_MESSAGE = "Database operation failed. Please try again.";
const DATABASE_METHODS_TO_SANITIZE = new Set<PropertyKey>([
  "batch",
  "execute",
  "executeMultiple",
  "transaction",
]);

function sanitizeDatabaseError(error: unknown): Error {
  const sanitized = new Error(DATABASE_ERROR_MESSAGE);
  sanitized.name = error instanceof Error && error.name ? error.name : "DatabaseError";
  return sanitized;
}

function createSanitizedDatabaseClient() {
  const rawClient = createClient({
    url: env.BETTER_AUTH_DATABASE_URL,
    authToken: env.BETTER_AUTH_DATABASE_AUTH_TOKEN,
  });

  return new Proxy(rawClient, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (!DATABASE_METHODS_TO_SANITIZE.has(property) || typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) => {
        try {
          const result = Reflect.apply(value, target, args);

          return Promise.resolve(result).catch((error: unknown) => {
            throw sanitizeDatabaseError(error);
          });
        } catch (error) {
          throw sanitizeDatabaseError(error);
        }
      };
    },
  });
}

const client = createSanitizedDatabaseClient();

/*
 * All Drizzle/libSQL errors pass through this client. Keep raw SQL and bound
 * params out of user-facing server action/API responses, even when callers
 * return `error.message` directly.
 */
export const PUBLIC_DATABASE_ERROR_MESSAGE = DATABASE_ERROR_MESSAGE;

export const db = drizzle(client, { schema });

export type Database = typeof db;
