import { and, inArray, eq } from "drizzle-orm";

import { loadEnvironment } from "./utils";

type MigrationAction = "clients_admin" | "oauth_client_login_allowed";

function actionForRelation(relation: string): MigrationAction {
  return relation === "use" ? "oauth_client_login_allowed" : "clients_admin";
}

async function main() {
  loadEnvironment();

  const { accessTuples } = await import("@/db/rebac-schema");
  const { db } = await import("@/lib/db");
  const { TupleRepository } = await import("@/lib/repositories/tuple-repository");

  const apply = process.argv.includes("--apply");
  const tupleRepo = new TupleRepository();
  const results: Array<{
    tupleId: string;
    clientId: string;
    relation: string;
    subjectType: string;
    subjectId: string;
    action: MigrationAction;
    replacementEntityType: string;
    replacementEntityId: string;
    replacementRelation: string;
    applied: boolean;
  }> = [];

  const legacyTuples = await db
    .select()
    .from(accessTuples)
    .where(
      and(
        eq(accessTuples.entityType, "oauth_client"),
        inArray(accessTuples.relation, ["owner", "admin", "use"])
      )
    );

  for (const tuple of legacyTuples) {
    const action = actionForRelation(tuple.relation);
    const replacement =
      action === "oauth_client_login_allowed"
        ? {
            entityType: "oauth_client_login",
            entityId: tuple.entityId,
            relation: "allowed",
          }
        : {
            entityType: "clients",
            entityId: "*",
            relation: "admin",
          };

    if (apply) {
      await tupleRepo.createIfNotExists({
        ...replacement,
        entityTypeId: null,
        subjectType: tuple.subjectType,
        subjectId: tuple.subjectId,
        subjectRelation: tuple.subjectRelation,
        condition: tuple.condition,
        authorizationSpaceId: null,
      });
      await tupleRepo.deleteById(tuple.id);
    }

    results.push({
      tupleId: tuple.id,
      clientId: tuple.entityId,
      relation: tuple.relation,
      subjectType: tuple.subjectType,
      subjectId: tuple.subjectId,
      action,
      replacementEntityType: replacement.entityType,
      replacementEntityId: replacement.entityId,
      replacementRelation: replacement.relation,
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
