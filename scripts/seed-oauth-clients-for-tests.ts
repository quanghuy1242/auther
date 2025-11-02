/**
 * Seed OAuth clients for testing with pre-defined client IDs
 * This script directly inserts into the database instead of using the registration API
 * to ensure the client IDs match the environment variables used in tests
 */

import { db } from "../src/lib/db";
import { oauthApplication } from "../src/db/auth-schema";

async function main() {
  const payloadClientId = process.env.PAYLOAD_CLIENT_ID;
  const payloadClientSecret = process.env.PAYLOAD_CLIENT_SECRET;
  const payloadRedirectUri = process.env.PAYLOAD_REDIRECT_URI;
  const payloadSpaClientId = process.env.PAYLOAD_SPA_CLIENT_ID;
  const payloadSpaRedirectUris = process.env.PAYLOAD_SPA_REDIRECT_URIS;

  if (!payloadClientId || !payloadClientSecret || !payloadRedirectUri) {
    console.error('Missing required environment variables for OAuth client seeding');
    process.exit(1);
  }

  try {
    // Insert Payload Admin (confidential client)
    await db.insert(oauthApplication).values({
      id: `oauth_app_${payloadClientId}`,
      clientId: payloadClientId,
      clientSecret: payloadClientSecret,
      name: 'Payload Admin',
      redirectURLs: JSON.stringify([payloadRedirectUri]),
      type: 'web',
      disabled: false,
      userId: null,
      metadata: JSON.stringify({
        tokenEndpointAuthMethod: 'client_secret_basic',
        grantTypes: ['authorization_code'],
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    console.log(`✅ Seeded Payload Admin client: ${payloadClientId}`);

    // Insert Payload SPA (public client) if configured
    if (payloadSpaClientId && payloadSpaRedirectUris) {
      const redirectUris = payloadSpaRedirectUris.split(',').map(uri => uri.trim());
      
      await db.insert(oauthApplication).values({
        id: `oauth_app_${payloadSpaClientId}`,
        clientId: payloadSpaClientId,
        clientSecret: null,
        name: 'Payload SPA',
        redirectURLs: JSON.stringify(redirectUris),
        type: 'public',
        disabled: false,
        userId: null,
        metadata: JSON.stringify({
          tokenEndpointAuthMethod: 'none',
          grantTypes: ['authorization_code'],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();

      console.log(`✅ Seeded Payload SPA client: ${payloadSpaClientId}`);
    }

    console.log('\n✅ OAuth client seeding complete');
  } catch (error) {
    console.error('❌ Failed to seed OAuth clients:', error);
    process.exit(1);
  }
}

main().catch(console.error);
