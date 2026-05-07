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
    const ensured = [
      "registration_contexts_slug_unique",
      "webhook_endpoint_user_id_idx",
      "webhook_endpoint_authorization_space_id_idx",
    ];

    await client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS registration_contexts_slug_unique
      ON registration_contexts (slug)
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS webhook_endpoint_user_id_idx
      ON webhook_endpoint (user_id)
    `);
    await client.execute(`
      CREATE INDEX IF NOT EXISTS webhook_endpoint_authorization_space_id_idx
      ON webhook_endpoint (authorization_space_id)
    `);

    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      ensured,
    }, null, 2));
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
