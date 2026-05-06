import { sql } from "drizzle-orm";
import { oauthClientMetadata, userClientAccess, groupClientAccess } from "@/db/app-schema";
import { accessTuples } from "@/db/rebac-schema";
import {
  platformInvites,
  permissionRequests,
  permissionRules,
  registrationContexts,
} from "@/db/platform-access-schema";
import { db } from "@/lib/db";

async function count(query: PromiseLike<unknown[]>): Promise<number> {
  const rows = await query;
  return rows.length;
}

async function main() {
  const [
    legacyOAuthClientAccessTuples,
    contextsWithClientId,
    requestsWithClientId,
    rulesWithClientId,
    metadataWithGrantProjection,
    userClientAccessRows,
    groupClientAccessRows,
    pendingInvites,
  ] = await Promise.all([
    count(db.select({ id: accessTuples.id }).from(accessTuples).where(sql`${accessTuples.entityType} = 'oauth_client' AND ${accessTuples.relation} IN ('owner', 'admin', 'use')`)),
    count(db.select({ id: registrationContexts.id }).from(registrationContexts).where(sql`${registrationContexts.clientId} IS NOT NULL`)),
    count(db.select({ id: permissionRequests.id }).from(permissionRequests).where(sql`${permissionRequests.clientId} IS NOT NULL`)),
    count(db.select({ id: permissionRules.id }).from(permissionRules).where(sql`${permissionRules.clientId} IS NOT NULL`)),
    count(db.select({ id: oauthClientMetadata.id }).from(oauthClientMetadata).where(sql`${oauthClientMetadata.grantProjectionClientIds} <> '[]'`)),
    count(db.select({ id: userClientAccess.id }).from(userClientAccess)),
    count(db.select({ id: groupClientAccess.id }).from(groupClientAccess)),
    count(db.select({ id: platformInvites.id }).from(platformInvites).where(sql`${platformInvites.consumedAt} IS NULL`)),
  ]);

  const legacyOAuthClientAccessSamples = await db
    .select({
      id: accessTuples.id,
      clientId: accessTuples.entityId,
      relation: accessTuples.relation,
      subjectType: accessTuples.subjectType,
      subjectId: accessTuples.subjectId,
    })
    .from(accessTuples)
    .where(sql`${accessTuples.entityType} = 'oauth_client' AND ${accessTuples.relation} IN ('owner', 'admin', 'use')`)
    .limit(25);

  const contextSamples = await db
    .select({
      id: registrationContexts.id,
      slug: registrationContexts.slug,
      clientId: registrationContexts.clientId,
      triggerKind: registrationContexts.triggerKind,
      targetKind: registrationContexts.targetKind,
      targetId: registrationContexts.targetId,
    })
    .from(registrationContexts)
    .where(sql`${registrationContexts.clientId} IS NOT NULL OR ${registrationContexts.triggerKind} IS NULL OR ${registrationContexts.targetKind} IS NULL`)
    .limit(25);

  const requestSamples = await db
    .select({
      id: permissionRequests.id,
      userId: permissionRequests.userId,
      clientId: permissionRequests.clientId,
      relation: permissionRequests.relation,
      requestKind: permissionRequests.requestKind,
      targetKind: permissionRequests.targetKind,
      targetId: permissionRequests.targetId,
    })
    .from(permissionRequests)
    .where(sql`${permissionRequests.clientId} IS NOT NULL OR ${permissionRequests.requestKind} IS NULL OR ${permissionRequests.targetKind} IS NULL`)
    .limit(25);

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      legacyOAuthClientAccessTuples,
      contextsWithClientId,
      requestsWithClientId,
      rulesWithClientId,
      metadataWithGrantProjection,
      userClientAccessRows,
      groupClientAccessRows,
      pendingInvites,
    },
    legacyOAuthClientAccessSamples,
    contextSamples,
    requestSamples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
