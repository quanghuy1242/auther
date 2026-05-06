import { sql } from "drizzle-orm";
import { authorizationModelAliases, authorizationModels, accessTuples } from "@/db/rebac-schema";
import { oauthClientSpaceLinks } from "@/db/app-schema";
import { db } from "@/lib/db";

async function count(query: PromiseLike<unknown[]>): Promise<number> {
  const rows = await query;
  return rows.length;
}

async function main() {
  const [
    spaceModels,
    clientPrefixedModels,
    modelsWithoutSpace,
    clientPrefixedTuples,
    tuplesWithoutSpace,
    oauthClientSpaceLinkCount,
    activeAliases,
  ] = await Promise.all([
    count(db.select({ id: authorizationModels.id }).from(authorizationModels).where(sql`${authorizationModels.authorizationSpaceId} IS NOT NULL`)),
    count(db.select({ id: authorizationModels.id }).from(authorizationModels).where(sql`${authorizationModels.entityType} LIKE 'client_%'`)),
    count(db.select({ id: authorizationModels.id }).from(authorizationModels).where(sql`${authorizationModels.authorizationSpaceId} IS NULL`)),
    count(db.select({ id: accessTuples.id }).from(accessTuples).where(sql`${accessTuples.entityType} LIKE 'client_%'`)),
    count(db.select({ id: accessTuples.id }).from(accessTuples).where(sql`${accessTuples.authorizationSpaceId} IS NULL`)),
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
    .where(sql`${authorizationModels.entityType} LIKE 'client_%' AND ${authorizationModels.authorizationSpaceId} IS NULL`);

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
    .where(sql`${accessTuples.entityType} LIKE 'client_%' OR ${accessTuples.authorizationSpaceId} IS NULL`)
    .limit(25);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      spaceModels,
      clientPrefixedModels,
      modelsWithoutSpace,
      clientPrefixedTuples,
      tuplesWithoutSpace,
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
