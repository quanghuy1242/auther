/**
 * Idempotently creates the R2 Payload content authorization space and links
 * the known Payload/blog OAuth clients to it.
 *
 * This is migration support, not a topology rewrite. Payload projection routing
 * remains client-based until R3.
 */

import { eq, inArray } from "drizzle-orm";
import { loadEnvironment, exitWithError } from "./utils";

loadEnvironment();

const PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG = "payload-content-api";
const PAYLOAD_CONTENT_SPACE_SLUG = "payload-content";
const PAYLOAD_CONTENT_MODEL_NAMES = ["book", "chapter", "comment"];

async function main() {
  const payloadClientId = process.env.PAYLOAD_CLIENT_ID?.trim();
  const blogClientId = process.env.BLOG_CLIENT_ID?.trim();

  if (!payloadClientId) {
    exitWithError("R2 Payload space seed failed", "PAYLOAD_CLIENT_ID is required");
  }

  const { db } = await import("../src/lib/db");
  const { authorizationModels, authorizationSpaces, oauthClientSpaceLinks, resourceServers } =
    await import("../src/db/schema");

  const [existingResourceServer] = await db
    .select()
    .from(resourceServers)
    .where(eq(resourceServers.slug, PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG));

  const resourceServerId = existingResourceServer?.id ?? crypto.randomUUID();

  if (!existingResourceServer) {
    await db.insert(resourceServers).values({
      id: resourceServerId,
      slug: PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG,
      name: "Payload Content API",
      audience: PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG,
      description: "Payload CMS content API resource server.",
      enabled: true,
    });
  }

  const [existingSpace] = await db
    .select()
    .from(authorizationSpaces)
    .where(eq(authorizationSpaces.slug, PAYLOAD_CONTENT_SPACE_SLUG));

  const authorizationSpaceId = existingSpace?.id ?? crypto.randomUUID();

  if (existingSpace) {
    await db
      .update(authorizationSpaces)
      .set({
        resourceServerId,
        enabled: true,
        updatedAt: new Date(),
      })
      .where(eq(authorizationSpaces.id, authorizationSpaceId));
  } else {
    await db.insert(authorizationSpaces).values({
      id: authorizationSpaceId,
      slug: PAYLOAD_CONTENT_SPACE_SLUG,
      name: "Payload Content",
      description: "Authorization space for Payload CMS content grants.",
      enabled: true,
      resourceServerId,
    });
  }

  const clientLinks = [
    { clientId: payloadClientId, accessMode: "full" as const },
    ...(blogClientId ? [{ clientId: blogClientId, accessMode: "can_trigger_contexts" as const }] : []),
  ];

  for (const link of clientLinks) {
    const [existingLink] = await db
      .select()
      .from(oauthClientSpaceLinks)
      .where(eq(oauthClientSpaceLinks.clientId, link.clientId));

    if (existingLink?.authorizationSpaceId === authorizationSpaceId) {
      await db
        .update(oauthClientSpaceLinks)
        .set({ accessMode: link.accessMode, updatedAt: new Date() })
        .where(eq(oauthClientSpaceLinks.id, existingLink.id));
      continue;
    }

    await db.insert(oauthClientSpaceLinks).values({
      id: crypto.randomUUID(),
      clientId: link.clientId,
      authorizationSpaceId,
      accessMode: link.accessMode,
    }).onConflictDoNothing();
  }

  const payloadModelEntityTypes = PAYLOAD_CONTENT_MODEL_NAMES.map(
    (modelName) => `client_${payloadClientId}:${modelName}`
  );

  const updatedModels = await db
    .update(authorizationModels)
    .set({
      authorizationSpaceId,
      updatedAt: new Date(),
    })
    .where(inArray(authorizationModels.entityType, payloadModelEntityTypes));

  console.log("R2 Payload content authorization space ready.");
  console.log(`  resourceServerId:       ${resourceServerId}`);
  console.log(`  authorizationSpaceId:   ${authorizationSpaceId}`);
  console.log(`  payloadClientId:        ${payloadClientId}`);
  console.log(`  blogClientId:           ${blogClientId ?? "(not configured)"}`);
  console.log(`  backfilledModelCount:   ${updatedModels.rowsAffected}`);
}

main().catch((error) => {
  exitWithError("R2 Payload space seed failed", error);
});
