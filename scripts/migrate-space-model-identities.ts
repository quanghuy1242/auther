import { eq, sql } from "drizzle-orm";
import { authorizationModels } from "@/db/rebac-schema";
import { db } from "@/lib/db";
import { AuthorizationModelRepository } from "@/lib/repositories/authorization-model-repository";
import { TupleRepository } from "@/lib/repositories/tuple-repository";

function modelKeyFromEntityType(entityType: string): string {
  return entityType.includes(":")
    ? entityType.slice(entityType.indexOf(":") + 1)
    : entityType;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const repo = new AuthorizationModelRepository();
  const tupleRepo = new TupleRepository();

  const candidates = await db
    .select({
      id: authorizationModels.id,
      entityType: authorizationModels.entityType,
      authorizationSpaceId: authorizationModels.authorizationSpaceId,
    })
    .from(authorizationModels)
    .where(sql`${authorizationModels.entityType} LIKE 'client_%:%' AND ${authorizationModels.authorizationSpaceId} IS NOT NULL`);

  const results: Array<{
    modelId: string;
    authorizationSpaceId: string;
    aliasEntityType: string;
    canonicalEntityType: string;
    applied: boolean;
  }> = [];

  for (const model of candidates) {
    if (!model.authorizationSpaceId) continue;

    const canonicalEntityType = `space_${model.authorizationSpaceId}:${modelKeyFromEntityType(model.entityType)}`;

    if (apply) {
      await repo.createAlias({
        authorizationModelId: model.id,
        authorizationSpaceId: model.authorizationSpaceId,
        aliasEntityType: model.entityType,
        canonicalEntityType,
        source: "legacy_client_prefix",
      });

      await db
        .update(authorizationModels)
        .set({ entityType: canonicalEntityType, updatedAt: new Date() })
        .where(eq(authorizationModels.id, model.id));
      await tupleRepo.updateEntityTypeString(model.id, canonicalEntityType);
    }

    results.push({
      modelId: model.id,
      authorizationSpaceId: model.authorizationSpaceId,
      aliasEntityType: model.entityType,
      canonicalEntityType,
      applied: apply,
    });
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    migratedCount: results.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
