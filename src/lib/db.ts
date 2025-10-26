import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@/env";
import * as schema from "@/db/schema";

const client = createClient({
  url: env.BETTER_AUTH_DATABASE_URL,
  authToken: env.BETTER_AUTH_DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;

