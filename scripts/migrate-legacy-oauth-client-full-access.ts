import { and, eq } from "drizzle-orm";

import { loadEnvironment } from "./utils";

async function main() {
  loadEnvironment();

  const { accessTuples } = await import("@/db/rebac-schema");
  const { oauthClientSpaceLinks } = await import("@/db/app-schema");
  const { db } = await import("@/lib/db");
  const { TupleRepository } = await import("@/lib/repositories/tuple-repository");

  const apply = process.argv.includes("--apply");
  const tupleRepo = new TupleRepository();
  const results: Array<{
    tupleId: string;
    clientId: string;
    subjectType: string;
    subjectId: string;
    action: "convert" | "delete_unmapped";
    authorizationSpaceIds: string[];
    applied: boolean;
  }> = [];

  const legacyTuples = await db
    .select()
    .from(accessTuples)
    .where(
      and(
        eq(accessTuples.entityType, "oauth_client"),
        eq(accessTuples.relation, "full_access")
      )
    );

  for (const tuple of legacyTuples) {
    const fullAccessLinks = await db
      .select()
      .from(oauthClientSpaceLinks)
      .where(
        and(
          eq(oauthClientSpaceLinks.clientId, tuple.entityId),
          eq(oauthClientSpaceLinks.accessMode, "full")
        )
      );

    if (fullAccessLinks.length > 0) {
      if (apply) {
        for (const link of fullAccessLinks) {
          await tupleRepo.createIfNotExists({
            entityType: "authorization_space",
            entityTypeId: null,
            entityId: link.authorizationSpaceId,
            relation: "full_access",
            subjectType: tuple.subjectType,
            subjectId: tuple.subjectId,
            subjectRelation: tuple.subjectRelation,
            condition: tuple.condition,
            authorizationSpaceId: link.authorizationSpaceId,
          });
        }
        await tupleRepo.deleteById(tuple.id);
      }

      results.push({
        tupleId: tuple.id,
        clientId: tuple.entityId,
        subjectType: tuple.subjectType,
        subjectId: tuple.subjectId,
        action: "convert",
        authorizationSpaceIds: fullAccessLinks.map((link) => link.authorizationSpaceId),
        applied: apply,
      });
      continue;
    }

    if (apply) {
      await tupleRepo.deleteById(tuple.id);
    }

    results.push({
      tupleId: tuple.id,
      clientId: tuple.entityId,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      action: "delete_unmapped",
      authorizationSpaceIds: [],
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
