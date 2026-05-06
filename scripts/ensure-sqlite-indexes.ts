import { createClient } from "@libsql/client";

import { loadEnvironment, validateEnvVars } from "./utils";

async function main() {
  loadEnvironment();
  validateEnvVars({
    BETTER_AUTH_DATABASE_URL: process.env.BETTER_AUTH_DATABASE_URL,
  });

  const client = createClient({
    url: process.env.BETTER_AUTH_DATABASE_URL as string,
    authToken: process.env.BETTER_AUTH_DATABASE_AUTH_TOKEN,
  });

  try {
    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS registration_contexts_slug_unique
      ON registration_contexts (slug)
    `);

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      ensured: ["registration_contexts_slug_unique"],
    }, null, 2));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
