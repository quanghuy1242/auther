import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

const databaseUrl = process.env.BETTER_AUTH_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("BETTER_AUTH_DATABASE_URL is required for Drizzle configuration");
}

const authToken = process.env.BETTER_AUTH_DATABASE_AUTH_TOKEN;
const connectionUrl =
  authToken && !databaseUrl.includes("authToken=")
    ? `${databaseUrl}${databaseUrl.includes("?") ? "&" : "?"}authToken=${authToken}`
    : databaseUrl;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: connectionUrl,
  },
});
