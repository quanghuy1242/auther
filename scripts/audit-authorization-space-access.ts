import { notInArray, sql } from "drizzle-orm";
import { loadEnvironment } from "./utils";

async function count(query: PromiseLike<unknown[]>): Promise<number> {
  const rows = await query;
  return rows.length;
}

async function main() {
  loadEnvironment();

  const { authorizationModelAliases, authorizationModels, accessTuples } = await import("@/db/rebac-schema");
  const { oauthClientSpaceLinks } = await import("@/db/app-schema");
  const { SYSTEM_MODELS } = await import("@/lib/auth/system-models");
  const { db } = await import("@/lib/db");
  const clientPrefixPattern = "client\\_%";
  const systemEntityTypes = SYSTEM_MODELS.map((model) => model.entityType);

  const [
    spaceModels,
    clientPrefixedModels,
    modelsWithoutSpace,
    clientPrefixedTuples,
    nonSystemTuplesWithoutSpace,
    oauthClientSpaceLinkCount,
    activeAliases,
  ] = await Promise.all([
    count(db.select({ id: authorizationModels.id }).from(authorizationModels).where(sql`${authorizationModels.authorizationSpaceId} IS NOT NULL`)),
    count(db.select({ id: authorizationModels.id }).from(authorizationModels).where(sql`${authorizationModels.entityType} LIKE ${clientPrefixPattern} ESCAPE '\\'`)),
    count(db.select({ id: authorizationModels.id }).from(authorizationModels).where(sql`${authorizationModels.authorizationSpaceId} IS NULL`)),
    count(db.select({ id: accessTuples.id }).from(accessTuples).where(sql`${accessTuples.entityType} LIKE ${clientPrefixPattern} ESCAPE '\\'`)),
    count(
      db.select({ id: accessTuples.id })
        .from(accessTuples)
        .where(sql`${accessTuples.authorizationSpaceId} IS NULL AND ${notInArray(accessTuples.entityType, systemEntityTypes)}`)
    ),
    count(db.select({ id: oauthClientSpaceLinks.id }).from(oauthClientSpaceLinks)),
    count(db.select({ id: authorizationModelAliases.id }).from(authorizationModelAliases).where(sql`${authorizationModelAliases.retiredAt} IS NULL`)),
  ]);

  const ambiguousClientPrefixedModels = await db
    .select({
      id: authorizationModels.id,
      entityType: authorizationModels.entityType,
      authorizationSpaceId: authorizationModels.authorizationSpaceId,
    })
    .from(authorizationModels)
    .where(sql`${authorizationModels.entityType} LIKE ${clientPrefixPattern} ESCAPE '\\' AND ${authorizationModels.authorizationSpaceId} IS NULL`);

  const tupleSamples = await db
    .select({
      id: accessTuples.id,
      entityType: accessTuples.entityType,
      entityId: accessTuples.entityId,
      relation: accessTuples.relation,
      subjectType: accessTuples.subjectType,
      authorizationSpaceId: accessTuples.authorizationSpaceId,
    })
    .from(accessTuples)
    .where(sql`${accessTuples.entityType} LIKE ${clientPrefixPattern} ESCAPE '\\' OR (${accessTuples.authorizationSpaceId} IS NULL AND ${notInArray(accessTuples.entityType, systemEntityTypes)})`)
    .limit(25);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      spaceModels,
      clientPrefixedModels,
      modelsWithoutSpace,
      clientPrefixedTuples,
      nonSystemTuplesWithoutSpace,
      oauthClientSpaceLinkCount,
      activeAliases,
    },
    ambiguousClientPrefixedModels,
    tupleSamples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
