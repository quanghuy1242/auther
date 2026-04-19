# Client-Wide Full Access

**Status:** Proposal - In Review
**Date:** 2026-04-19

---

## Table of Contents

1. [Problem Statement and Motivation](#1-problem-statement-and-motivation)
2. [Current System Architecture](#2-current-system-architecture)
3. [Solution: The `full_access` Relation](#3-solution-the-full_access-relation)
4. [Tuple Storage Design](#4-tuple-storage-design)
5. [Authorization Evaluation Changes](#5-authorization-evaluation-changes)
6. [API Key Token Exchange Changes](#6-api-key-token-exchange-changes)
7. [Server Actions Changes](#7-server-actions-changes)
8. [Webhook Parity for API Key Subjects](#8-webhook-parity-for-api-key-subjects)
9. [Admin UI Changes](#9-admin-ui-changes)
10. [Security Considerations](#10-security-considerations)
11. [Observability and Metrics](#11-observability-and-metrics)
12. [Backlog](#12-backlog)
13. [Affected Files Reference](#13-affected-files-reference)

---

## 1. Problem Statement and Motivation

### 1.1 The Machine-to-Machine Pain Point

API keys used as service accounts (machine-to-machine) require access to all entity types within a client scope. Currently, the only way to model this is to write one or more `access_tuples` rows per resource type per relation. When a client has five resource types, creating a full-access API key requires writing ten or more tuples. When a new resource type is added to the client, all full-access keys silently lose access to it until an operator manually grants the missing tuples.

This is operationally fragile. A single missing grant breaks workflows invisibly and the fix is manual and error-prone.

### 1.2 The Same Problem for Human Operators and Groups

The same issue applies to users and groups used as service identities or internal automation accounts. A group given "full access" to a client still requires per-resource-type grants. Adding a new resource type orphans the group from that resource silently.

### 1.3 What We Need

A single grant that reads: **"this actor has full access to all resources scoped to client X."**

This grant must:
- Apply to any current and future resource type in that client scope automatically.
- Work for `user`, `group`, and `apikey` subject types.
- Not require iteration over entity types at grant time or at authorization check time.
- Remain strictly scoped to one client. No cross-client bleed.
- Be revocable immediately with a single operation.
- Coexist safely with fine-grained scoped tuples for actors that have both.

### 1.4 Non-Goals

- This does not replace fine-grained scoped permissions. Both models coexist.
- This does not create a platform-level bypass. The grant is anchored to one client.
- This does not bypass authentication or the Better Auth API key verification step.
- This does not implicitly grant the ability to manage the client itself (`owner`, `admin`, `use` platform access remains separate).

---

## 2. Current System Architecture

Understanding what already exists is essential for designing the minimal correct change.

### 2.1 The `access_tuples` Table

`src/db/rebac-schema.ts` defines the `access_tuples` table. Its columns are:

```
id            TEXT PRIMARY KEY        -- sha256 hash of (entityType|entityId|relation|subjectType|subjectId|subjectRelation)
entity_type   TEXT NOT NULL           -- e.g. 'oauth_client', 'client_abc123:invoice'
entity_type_id TEXT                   -- FK to authorization_models.id, nullable for platform-level rows
entity_id     TEXT NOT NULL           -- specific ID or '*' for wildcard
relation      TEXT NOT NULL           -- e.g. 'owner', 'admin', 'viewer', 'full_access'
subject_type  TEXT NOT NULL           -- 'user', 'group', 'apikey'
subject_id    TEXT NOT NULL
subject_relation TEXT                 -- nullable, for set-based subjects (Zanzibar pattern)
condition     TEXT                    -- nullable Lua ABAC condition
```

Two usage patterns already exist in this table:

**Pattern A - Platform access** (who can manage a client):
```
entity_type = 'oauth_client'
entity_id   = '<clientId>'
relation    = 'owner' | 'admin' | 'use'
subject_type = 'user' | 'group'
entity_type_id = NULL   <-- no authorization_model for oauth_client itself
```

**Pattern B - Scoped permissions** (what an actor can do on client resources):
```
entity_type   = 'client_<clientId>:<resourceType>'
entity_id     = '*' | '<resourceId>'
relation      = 'viewer' | 'editor' | <any model relation>
subject_type  = 'user' | 'group' | 'apikey'
entity_type_id = '<authorizationModels.id>'   <-- FK to model
```

### 2.2 `PermissionService.checkPermission`

`src/lib/auth/permission-service.ts` implements the authorization check. The current evaluation order is:

```
0. Global admin bypass (user.role === 'admin')
1. Load authorization model for entityType. Deny if missing.
2. Resolve required relation from permission definition.
3. Expand subjects via BFS: direct subject -> legacy user groups -> hierarchy tuples.
4. Expand implied relations (transitivity: viewer implied by editor, etc.).
5. For each (subject, relation) pair:
   a. Direct tuple lookup (exact entityId match).
   b. Wildcard tuple lookup (entityId = '*').
   c. Evaluate ABAC policy if tuple found.
   d. Return allowed=true on first passing policy.
6. Return allowed=false (no tuple matched or all policies denied).
```

The `full_access` fast path needs to be inserted between steps 0 and 1, so that it can short-circuit before the authorization model lookup - which would fail for `oauth_client` entity type if we tried to run normal logic.

### 2.3 Subject Expansion in `expandSubjects`

The BFS expansion already handles:
- Direct subject
- Legacy `user -> group` membership via `UserGroupRepository.getUserGroups`
- Hierarchy tuples where `relDef.subjectParams.hierarchy === true`

This means group-inherited `full_access` works for free. If a group holds a `full_access` tuple and a user is a member of that group, the BFS will expand the user to include the group, and the group's `full_access` tuple will be detected. Same applies to API keys that are group members.

### 2.4 `ApiKeyPermissionResolver.resolvePermissionsWithABACInfo`

`src/lib/services/api-key-permission-resolver.ts` resolves permissions for JWT generation at the `/api/auth/api-key/exchange` endpoint. It:
1. Finds all tuples where `subjectType='apikey'` and `subjectId=<apiKeyId>`.
2. Expands to include group tuples the API key belongs to.
3. For each tuple, loads the authorization model and expands permissions.
4. Returns `{ permissions, abac_required }` for JWT claims.

It does not currently produce a `client_full_access` claim. This must be added.

### 2.5 Webhook Parity Gap

`src/lib/repositories/tuple-repository.ts` contains:

```typescript
function isSupportedGrantSubjectType(subjectType: string): subjectType is "user" | "group" {
  return subjectType === "user" || subjectType === "group";
}

private shouldEmitGrantWebhook(tuple: Tuple): tuple is Tuple & { subjectType: "user" | "group" } {
  if (!isSupportedGrantSubjectType(tuple.subjectType)) {
    return false;  // <-- apikey tuples are silently dropped here
  }
  // ...
}
```

API key `full_access` tuples will be silently dropped from webhook delivery unless this guard is explicitly updated for the `full_access` relation on `oauth_client`. The fix requires scoping the change carefully - we want webhook events for `full_access` apikey tuples only, not for all apikey tuples (which would include every scoped permission grant currently in production).

### 2.6 `createClientApiKey` and Tuple Write Pattern

`src/app/admin/clients/[id]/access/actions.ts` - `createClientApiKey` currently:
1. Validates permissions map against authorization models.
2. Creates the API key via Better Auth with empty `permissions: {}`.
3. Writes one tuple per `(entityType, relation)` pair with `entityId='*'`.

**Important - Better Auth key ownership:** Every API key created by Better Auth is always linked to an owning user via `userId: session.user.id`. This is required by Better Auth's data model and does not change with this feature. The `permissions: {}` passed in step 2 is intentionally empty - we deliberately skip Better Auth's internal permission model entirely. Better Auth is used only as the key lifecycle store (creation, validation, expiry, revocation). All permission logic - both scoped and `full_access` - lives exclusively in our `access_tuples` table. When `auth.api.verifyApiKey` is called at runtime, it validates that the key is active and not expired; our code then resolves what the key can actually do by querying our tuples.

For full-access mode, step 1 and step 3 must be replaced with a single tuple write:
```
entityType = 'oauth_client'
entityId   = <clientId>
relation   = 'full_access'
subjectType = 'apikey'
subjectId  = <apiKeyId>
entityTypeId = null
```

### 2.7 `getClientApiKeys` Enrichment Gap

The enrichment loop in `getClientApiKeys` currently scans tuples where `entityType.startsWith('client_${clientId}:')`. A `full_access` tuple has `entityType='oauth_client'` and would not match this prefix. The enrichment logic must be updated to detect this pattern and set an `accessMode: 'full_access'` flag on the returned key object.

---

## 3. Solution: The `full_access` Relation

### 3.1 The Core Idea

Reuse the existing `access_tuples` table using Pattern A (same as `owner`/`admin`/`use`) but with a new reserved relation string `full_access`:

```
entity_type   = 'oauth_client'
entity_id     = '<clientId>'
relation      = 'full_access'
subject_type  = 'user' | 'group' | 'apikey'
subject_id    = '<actorId>'
entity_type_id = NULL
condition      = NULL
```

This is a single-row grant. No iteration over resource types. No new table.

**`full_access` is a platform-hardcoded contract, not a model-defined relation.** Clients never define `full_access` in their JSON authorization model (the `definition` column of `authorization_models`). It is not a relation that appears in any `{"relations": {...}}` block. The fast path in `checkPermission` runs entirely before the authorization model is loaded - there is no model lookup at all for a `full_access` check. This is the same pattern as the global admin bypass at step 0: it is a platform rule, invisible to client-owned models. Client developers do not need to know it exists or do anything to enable it.

### 3.2 Why This Fits

- The `oauth_client` entity type is already used in this table for `owner`/`admin`/`use`. Adding `full_access` follows the exact same pattern.
- `entity_type_id` is already `NULL` for all Pattern A rows. No schema change needed.
- The BFS subject expansion in `expandSubjects` already traverses group memberships. Group-inherited `full_access` works without code changes to the BFS logic.
- `TupleRepository.create` and `delete` already handle the tuple lifecycle. No new repository methods are needed for the core grant/revoke operations.

### 3.3 Semantic Distinction from Platform Access

`owner`, `admin`, and `use` govern **management capability** (who can configure the client, manage access, create keys).

`full_access` governs **runtime data authorization** (what the actor can do against client-scoped resources at API time).

They must not be conflated. The `full_access` relation does not imply `admin` and `admin` does not imply `full_access`. The `getPlatformAccessList` function must be updated to exclude `full_access` from its results, and a new `getClientWideAccessList` function must return `full_access` rows separately.

### 3.4 `entityTypeId` for Full Access Tuples

The `entity_type_id` column links tuples to an authorization model. There is no `authorization_models` row for the base `oauth_client` entity type - it is a platform-managed type, not a client-defined model. Therefore, `entity_type_id = NULL` is correct for `full_access` tuples, consistent with existing `owner`/`admin`/`use` tuples.

### 3.5 Scope Boundary Enforcement

The `full_access` grant is scoped to one client by its `entity_id = <clientId>`. The authorization check must verify that the `entityType` being checked actually belongs to that client before applying the bypass.

Client-scoped entity types follow the pattern `client_<clientId>:<resourceType>`. The check is:

```typescript
function extractClientIdFromEntityType(entityType: string): string | null {
  const match = entityType.match(/^client_([^:]+):.+$/);
  return match ? match[1] : null;
}
```

The pattern `^client_([^:]+):.+$` requires both a clientId segment and a resource type segment. This correctly excludes:
- The bare `client_<clientId>` legacy entity type (no resource type segment).
- The `oauth_client` entity type itself.
- Unrelated entity types.

---

## 4. Tuple Storage Design

### 4.1 Exact Tuple Shape

For a user or group:
```typescript
await tupleRepository.create({
  entityType: "oauth_client",
  entityId: clientId,
  relation: "full_access",
  subjectType: "user" | "group",
  subjectId: userId | groupId,
  entityTypeId: null,
  subjectRelation: null,
  condition: null,
});
```

For an API key:
```typescript
await tupleRepository.create({
  entityType: "oauth_client",
  entityId: clientId,
  relation: "full_access",
  subjectType: "apikey",
  subjectId: apiKeyId,
  entityTypeId: null,
  subjectRelation: null,
  condition: null,
});
```

### 4.2 Tuple ID Determinism

`TupleRepository.buildTupleId` uses a sha256 of `entityType|entityId|relation|subjectType|subjectId|subjectRelation`. This means:
- Grant is idempotent: calling `create` twice produces the same `id`, and the `onConflictDoNothing` clause prevents duplicates.
- Revoke is deterministic: `delete` can be called with the same params without needing to look up the row ID first.

### 4.3 No Metadata Table Needed

The original proposal suggested a separate metadata table for `reason`, `expiresAt`, and `changedBy`. This is premature for the initial implementation. The `access_tuples` table already has `createdAt` and `updatedAt`. Governance fields can be added in a follow-up when there is a concrete audit surface to display them. Adding a joined table in the first iteration increases schema complexity without an immediate consumer.

### 4.4 Impact on `getPlatformAccessList`

`getPlatformAccessList` in `src/app/admin/clients/[id]/access/actions.ts` queries tuples where `entityType='oauth_client'` and filters `relation IN ('owner', 'admin', 'use')`. This explicit filter already excludes `full_access`. No change required to this function.

---

## 5. Authorization Evaluation Changes

### 5.1 New Fast Path in `PermissionService.checkPermission`

The `full_access` bypass must be inserted after the global admin bypass (step 0) and before the authorization model lookup (step 1). This is critical because step 1 would deny access for `full_access` evaluation paths - there is no authorization model for `oauth_client`.

```typescript
// After step 0 (global admin bypass), before step 1 (model lookup):

// full_access fast path
const clientIdForCheck = extractClientIdFromEntityType(entityType);
if (clientIdForCheck) {
  const expandedSubjects = await this.expandSubjects(subjectType, subjectId);
  for (const subject of expandedSubjects) {
    const fullAccessTuple = await this.tupleRepo.findExact({
      entityType: "oauth_client",
      entityId: clientIdForCheck,
      relation: "full_access",
      subjectType: subject.type,
      subjectId: subject.id,
    });
    if (fullAccessTuple) {
      void metricsService.histogram("authz.check.duration_ms", performance.now() - checkStart, {
        result: "allowed",
        entity_type: entityType,
      });
      void metricsService.count("authz.decision.count", 1, {
        result: "allowed",
        source: "client_full_access",
      });
      return true;
    }
  }
}
```

**Why `expandSubjects` is called here and not later:** The existing step 3 calls `expandSubjects` but that is unreachable if we short-circuit. We must expand subjects within the fast path to support group-inherited `full_access`. This does not duplicate work for the non-fast-path case because on the bypass path we return early before reaching step 3.

**ABAC interaction:** The `full_access` bypass skips ABAC policy evaluation. This is intentional and safe for the initial implementation. A full-access grant explicitly means "this actor has access to everything in this client scope." Applying per-resource ABAC gates on top of that would contradict the intent of the grant. If a consuming service needs ABAC-gated access even for full-access actors, they should not use a full-access grant - they should use scoped tuples with conditions.

### 5.2 New Helper: `extractClientIdFromEntityType`

Add as a **module-level exported function** in `src/lib/auth/permission-service.ts` (not a private method). It must be exported because two files need it:
- `permission-service.ts` itself calls it inside `checkPermission`
- `src/app/api/auth/check-permission/route.ts` imports it for the cross-client scope guard (BL-04)

```typescript
// src/lib/auth/permission-service.ts
export function extractClientIdFromEntityType(entityType: string): string | null {
  const match = entityType.match(/^client_([^:]+):.+$/);
  return match ? match[1] : null;
}
```

The regex `^client_([^:]+):.+$` matches only entity types of the form `client_<id>:<resource>`. It does not match:
- `client_<id>` (legacy bare type, no resource segment)
- `oauth_client` (platform type)
- Any other arbitrary string

In the check-permission route, import it directly:

```typescript
// src/app/api/auth/check-permission/route.ts
import { extractClientIdFromEntityType } from "@/lib/auth/permission-service";
```

Do not duplicate the regex in the route file. Import the shared function.

### 5.3 `checkPermission` Route (`/api/auth/check-permission`)

`src/app/api/auth/check-permission/route.ts` uses `PermissionService.checkPermission` directly. No route-level changes are needed. The fast path added to the service is transparent to the route.

However, when the auth method is an API key, the route must enforce the client scope boundary before calling `checkPermission`. The `authenticateClientApiKey` function in `src/lib/auth/client-api-key-auth.ts` validates that the API key's `metadata.oauth_client_id` matches the expected client. This boundary check must be performed before the `checkPermission` call for any route that uses direct API key auth.

The existing `/api/auth/check-permission` route already calls `auth.api.verifyApiKey` which validates the key itself, but it does not currently enforce that the `entityType` being checked belongs to the key's client. This is a security gap that must be addressed as part of this feature:

```typescript
// In check-permission/route.ts, after resolving subjectType='apikey':
if (subjectType === "apikey") {
  const keyClientId = verificationResult.key.metadata?.oauth_client_id;
  if (typeof keyClientId !== "string") {
    return NextResponse.json({ error: "forbidden", message: "API key missing client scope" }, { status: 403 });
  }
  const entityClientId = extractClientIdFromEntityType(entityType);
  if (entityClientId && entityClientId !== keyClientId) {
    return NextResponse.json({ error: "forbidden", message: "Cross-client check rejected" }, { status: 403 });
  }
}
```

### 5.4 `listObjects` Behavior

`PermissionService.listObjects` does not receive a bypass for `full_access`. The list-objects endpoint returns resources the actor has explicit tuples for, scoped by entity type. A `full_access` grant does not enumerate all possible entity IDs - it only allows checking access to a known entity ID. Adding full list-objects support for `full_access` actors requires a data scan (list all entities of all resource types in the client) which is outside the scope of this feature.

The existing wildcard tuple behavior (`entityId='*'`) already gives effective full-list behavior for scoped tuples. API keys created with `accessMode: full_access` should also have wildcard scoped tuples created if list-objects support is needed. This is a follow-up concern.

---

## 6. API Key Token Exchange Changes

### 6.1 New `client_full_access` JWT Claim

`src/app/api/auth/api-key/exchange/route.ts` calls `apiKeyPermissionResolver.resolvePermissionsWithABACInfo(apiKeyRecord.id)` and embeds the result in the JWT. The JWT currently includes `permissions` and optionally `abac_required`.

A new claim `client_full_access` must be added: an array of client IDs for which the API key holds a `full_access` grant.

```typescript
// In exchange/route.ts, after resolvePermissionsWithABACInfo:
const clientFullAccess = await apiKeyPermissionResolver.resolveClientFullAccess(apiKeyRecord.id);

// In SignJWT:
const token = await new SignJWT({
  scope: "api_key_exchange",
  permissions: permissions || {},
  abac_required: Object.keys(abac_required).length > 0 ? abac_required : undefined,
  client_full_access: clientFullAccess.length > 0 ? clientFullAccess : undefined,
  apiKeyId: apiKeyRecord?.id,
})
```

### 6.2 New `resolveClientFullAccess` Method on `ApiKeyPermissionResolver`

`src/lib/services/api-key-permission-resolver.ts` must add:

```typescript
/**
 * Returns client IDs for which this API key (or any group it belongs to)
 * holds a full_access grant on oauth_client.
 */
async resolveClientFullAccess(apiKeyId: string): Promise<string[]> {
  // Step 1: Expand subjects (apikey + groups it belongs to)
  const groupTuples = await tupleRepository.findBySubject("apikey", apiKeyId);
  const subjects: Array<{ type: string; id: string }> = [{ type: "apikey", id: apiKeyId }];
  for (const t of groupTuples) {
    if (t.entityType === "group" && t.relation === "member") {
      subjects.push({ type: "group", id: t.entityId });
    }
  }

  // Step 2: For each subject, look for full_access tuples on oauth_client
  const clientIds = new Set<string>();
  for (const subject of subjects) {
    const tuples = await tupleRepository.findBySubjectAndEntityTypeAndRelation(
      subject.type,
      subject.id,
      "oauth_client",
      "full_access"
    );
    for (const t of tuples) {
      clientIds.add(t.entityId);
    }
  }

  return Array.from(clientIds);
}
```

This requires a new repository method `findBySubjectAndEntityTypeAndRelation` on `TupleRepository`:

```typescript
async findBySubjectAndEntityTypeAndRelation(
  subjectType: string,
  subjectId: string,
  entityType: string,
  relation: string
): Promise<Tuple[]> {
  return await db
    .select()
    .from(accessTuples)
    .where(
      and(
        eq(accessTuples.subjectType, subjectType),
        eq(accessTuples.subjectId, subjectId),
        eq(accessTuples.entityType, entityType),
        eq(accessTuples.relation, relation)
      )
    );
}
```

### 6.3 JWT Consumer Contract

Consuming services that verify JWTs from this endpoint can check:

```typescript
// Check if this token has full access to a client:
function hasClientFullAccess(jwt: TokenPayload, clientId: string): boolean {
  return Array.isArray(jwt.client_full_access) && jwt.client_full_access.includes(clientId);
}
```

If `client_full_access` is present and contains the target client ID, the consumer can skip tuple-level permission checks for that client's resources. This is opt-in: existing consumers that only look at `permissions` continue to work.

---

## 7. Server Actions Changes

### 7.1 New Actions for Client-Wide Access Management

Add to `src/app/admin/clients/[id]/access/actions.ts`:

```typescript
// Grant full_access on oauth_client for a subject
export async function grantClientWideAccess(
  clientId: string,
  subjectType: "user" | "group" | "apikey",
  subjectId: string
): Promise<AssignUserResult> {
  await guards.clients.view();
  const { canManageAccess } = await getCurrentUserAccessLevel(clientId);
  if (!canManageAccess) {
    return { success: false, error: "Permission denied" };
  }

  // When granting full_access to an API key, validate it exists and belongs to this client.
  // This prevents orphaned grants for non-existent or cross-client API keys.
  //
  // NOTE: Better Auth does not expose a single-key-by-ID server-side lookup without a raw
  // key string to verify. auth.api.listApiKeys() is used here because it is the only
  // available method to look up a key by its record ID from a server action context.
  // This is acceptable because grantClientWideAccess is an infrequent admin operation,
  // not a hot path. If Better Auth adds a getApiKeyById method in a future version,
  // replace this with that.
  if (subjectType === "apikey") {
    const _headers = await headers();
    const allKeys = await auth.api.listApiKeys({ headers: _headers });
    const key = Array.isArray(allKeys) ? allKeys.find((k) => k.id === subjectId) : null;
    if (!key) {
      return { success: false, error: "API key not found" };
    }
    if (key.metadata?.oauth_client_id !== clientId) {
      return { success: false, error: "API key belongs to a different client" };
    }
  }

  await tupleRepository.create({
    entityType: "oauth_client",
    entityId: clientId,
    relation: "full_access",
    subjectType,
    subjectId,
    entityTypeId: null,
    subjectRelation: null,
    condition: null,
  });
  return { success: true };
}

// Revoke full_access on oauth_client for a subject
export async function revokeClientWideAccess(
  clientId: string,
  subjectType: "user" | "group" | "apikey",
  subjectId: string
): Promise<AssignUserResult> {
  await guards.clients.view();
  const { canManageAccess } = await getCurrentUserAccessLevel(clientId);
  if (!canManageAccess) {
    return { success: false, error: "Permission denied" };
  }
  const deleted = await tupleRepository.delete({
    entityType: "oauth_client",
    entityId: clientId,
    relation: "full_access",
    subjectType,
    subjectId,
  });
  if (!deleted) {
    return { success: false, error: "No full_access grant found to revoke" };
  }
  return { success: true };
}

// List all full_access grants for a client
export async function listClientWideAccess(clientId: string) {
  await guards.clients.view();
  const tuples = await tupleRepository.findByEntity("oauth_client", clientId);
  return tuples.filter((t) => t.relation === "full_access");
}

// Check if a specific subject has full_access
export async function checkClientWideAccess(
  clientId: string,
  subjectType: string,
  subjectId: string
): Promise<boolean> {
  await guards.clients.view();
  const tuple = await tupleRepository.findExact({
    entityType: "oauth_client",
    entityId: clientId,
    relation: "full_access",
    subjectType,
    subjectId,
  });
  return tuple !== null;
}
```

### 7.2 Modified `createClientApiKey`

The `createApiKeySchema` must accept an `accessMode` field:

```typescript
const createApiKeySchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2),
  accessMode: z.enum(["scoped", "full_access"]).default("scoped"),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
  expiresInDays: z.number().min(1).max(3650).optional(),
}).refine(
  (data) => data.accessMode !== "scoped" || (data.permissions && Object.keys(data.permissions).length > 0),
  { message: "permissions required when accessMode is scoped", path: ["permissions"] }
);
```

The function body branches at the point where tuples are written:

```typescript
if (validated.accessMode === "full_access") {
  // Single tuple: oauth_client / clientId / full_access / apikey / keyId
  // Uses create() (not createIfNotExists()) because:
  // - There is exactly one possible full_access tuple for this key (idempotent via onConflictDoNothing)
  // - We do not need the "was it newly created?" return value for rollback - the API key ID
  //   is enough to clean up via deleteBySubject()
  await tupleRepository.create({
    entityType: "oauth_client",
    entityId: validated.clientId,
    relation: "full_access",
    subjectType: "apikey",
    subjectId: result.id,
    entityTypeId: null,
    subjectRelation: null,
    condition: null,
  });
} else {
  // Existing scoped tuple write loop uses createIfNotExists() because it returns
  // { created: boolean } which can be used for rollback tracking per-tuple.
  for (const grant of preparedGrants) {
    await tupleRepository.createIfNotExists({ ... });
  }
}
```

The rollback logic on tuple write failure applies to both modes. In both cases, `tupleRepository.deleteBySubject("apikey", result.id)` cleans up all tuples for the key, which covers both the single `full_access` tuple and any scoped tuples.

### 7.3 Modified `getClientApiKeys` Enrichment

The enrichment loop must also check for `full_access` tuples on `oauth_client`:

```typescript
const tuples = await tupleRepository.findBySubject("apikey", key.id);

// Check for full_access grant
const fullAccessTuple = tuples.find(
  (t) => t.entityType === "oauth_client" && t.entityId === clientId && t.relation === "full_access"
);

if (fullAccessTuple) {
  return {
    ...key,
    accessMode: "full_access" as const,
    permissions: {},
  };
}

// Otherwise proceed with existing scoped permission extraction
const permissions: Record<string, string[]> = {};
const prefix = `client_${clientId}:`;
for (const tuple of tuples) {
  if (tuple.entityType.startsWith(prefix)) {
    // existing logic
  }
}
return {
  ...key,
  accessMode: "scoped" as const,
  permissions,
};
```

**Breaking type change note:** The return type of `getClientApiKeys` gains an `accessMode: "full_access" | "scoped"` field. All callers (primarily `src/components/admin/access-control/api-key-management.tsx`) must be updated to handle this new field. The `api-key-management.tsx` component already reads `key.permissions`; it must additionally read `key.accessMode` to know whether to show the Full Access badge or the permissions matrix. This is tracked in BL-12 and BL-14.

### 7.4 `revokeClientApiKey` Cleanup

`revokeClientApiKey` already calls `tupleRepository.deleteBySubject("apikey", keyId)` which deletes all tuples for that subject. This will correctly clean up the `full_access` tuple as well because it uses `subjectType='apikey'` and `subjectId=keyId` as the filter. No change required here.

---

## 8. Webhook Parity for API Key Subjects

### 8.1 The Current Gap and Why It Matters

`TupleRepository.shouldEmitGrantWebhook` returns `false` for any tuple where `subjectType !== 'user' && subjectType !== 'group'`. This means all API key tuple writes are currently silent for webhook consumers, including `full_access` grants.

**What these webhooks are for:** The existing `grant.created` and `grant.revoked` events allow external systems to observe permission changes in real time. For example, an external audit service or a downstream caching layer might subscribe to `grant.created` to know when a user or group gains new access. The `full_access` grant is a significant security event - granting an API key complete access to a client's resources - and external subscribers should be able to observe it the same way they observe user/group grants.

Without this fix, an API key being granted `full_access` would silently appear in tuples with no observable event. An external audit subscriber watching `grant.created` would see every user/group permission change but miss API key full-access grants entirely.

The fix must be scoped. We do not want to suddenly emit webhook events for every existing scoped API key tuple (that would be a breaking change for existing webhook consumers who do not expect `subjectType: 'apikey'` in `grant.created` payloads).

### 8.2 Scoped Fix: Emit for `full_access` Relation Only

Change `shouldEmitGrantWebhook` to allow `apikey` subjects specifically for the `full_access` relation on `oauth_client`:

```typescript
private shouldEmitGrantWebhook(tuple: Tuple): boolean {
  // Group membership has dedicated events
  if (tuple.entityType === "group" && tuple.relation === "member") {
    return false;
  }

  // For apikey subjects: only emit for full_access relation on oauth_client
  if (tuple.subjectType === "apikey") {
    return tuple.entityType === "oauth_client" && tuple.relation === "full_access";
  }

  // For user and group subjects: emit for all other tuples (existing behavior)
  return tuple.subjectType === "user" || tuple.subjectType === "group";
}
```

### 8.3 Webhook Payload for `apikey` Subjects

`src/lib/webhooks/grant-events.ts` defines `GrantSubjectType = "user" | "group"`. The `GrantCreatedEventData` and `GrantRevokedEventData` interfaces must extend to include `"apikey"`:

```typescript
type GrantSubjectType = "user" | "group" | "apikey";
```

The `emitGrantCreatedEvent` and `emitGrantRevokedEvent` functions themselves do not need changes - they accept the `data` argument and pass it through to `emitSystemScopedEvent`. Only the `GrantSubjectType` union and the call site in `shouldEmitGrantWebhook` need updating.

### 8.4 Backward Compatibility

Existing webhook consumers subscribed to `grant.created` and `grant.revoked` will start receiving payloads with `subjectType: "apikey"` when full-access grants are issued. This is a new value in an existing event. Consumers should be tolerant of unknown `subjectType` values per standard webhook consumer design. The event type name and payload structure remain unchanged - only the `subjectType` field value is new.

---

## 9. Admin UI Changes

### 9.1 API Key Creation Modal (`create-api-key-modal.tsx`)

`src/components/admin/access-control/create-api-key-modal.tsx` must add:

1. An **Access Mode** radio group with two options:
   - `Fine-grained access` (default) - shows the existing resource/relation matrix.
   - `Full client access` - hides the matrix and shows a warning banner.

2. A **warning banner** when full client access is selected:
   > "Full client access grants this API key permission to perform any operation on any resource type within this client. This is intended for service accounts and automation. Use scoped permissions for least-privilege access."

3. A **confirmation checkbox** that must be checked before the Create button becomes active when full client access is selected.

4. The `createClientApiKey` call must pass `accessMode: validated.accessMode` in the request body.

### 9.2 API Key Management Table (`api-key-management.tsx`)

`src/components/admin/access-control/api-key-management.tsx` must:

1. Read the `accessMode` field from the enriched key object returned by `getClientApiKeys`.
2. Display a **"Full Access"** badge in the permissions column when `accessMode === 'full_access'`, instead of the relation matrix.
3. Disable the scoped permission editing controls for full-access keys.

### 9.3 Scoped Permissions Panel (`scoped-permissions.tsx`)

`src/components/admin/access-control/scoped-permissions.tsx` renders per-subject access entries for users and groups. Add:

1. A **"Grant Full Client Access"** action button per subject row.
2. A **"Full Access Active"** status badge when the subject has a `full_access` tuple.
3. When full access is active, show a tooltip: "This actor has full access to all resources in this client. Scoped rules still apply for actors without full access."
4. A confirmation dialog before granting (shows client name and subject name).
5. A revoke action that calls `revokeClientWideAccess`.

### 9.4 Do Not Merge Into Platform Access Tab

The `full_access` relation must not appear in the platform access tab (`platform-access.tsx`). Platform access is about management capability. Client-wide resource access is a separate concept. They share the `oauth_client` entity type in the tuple table but serve entirely different purposes and must be displayed in separate UI sections.

---

## 10. Security Considerations

### 10.1 Authorization Gate

All new server actions (`grantClientWideAccess`, `revokeClientWideAccess`) call `getCurrentUserAccessLevel` and require `canManageAccess === true`. This is parity with the existing `grantPlatformAccess` and `grantScopedPermission` actions.

### 10.2 Cross-Client Isolation

The `extractClientIdFromEntityType` function enforces that the `full_access` bypass only applies when the `entityType` being checked belongs to the same client as the grant. Specifically:
- A grant of `full_access` on `oauth_client / clientA` cannot bypass checks for `entityType = 'client_clientB:invoice'`.
- The regex `^client_([^:]+):.+$` extracts `clientB` from the entityType and the fast path looks up the grant only for `entityId = clientB`, not `clientA`.

### 10.3 Scope Boundary in JWT

The `client_full_access` claim in the JWT is an array of client IDs. Consuming services must validate that the resource they are protecting belongs to one of those client IDs before granting bypass. They must not trust the claim blindly without cross-referencing against the resource's client ownership.

### 10.4 No Self-Elevation

A user who only has `use` (not `owner` or `admin`) on a client cannot call `grantClientWideAccess` because `canManageAccess` will be `false`. A user who has `full_access` as a runtime data grant is not thereby elevated to `owner` or `admin` for management operations.

### 10.5 Revocation Immediacy

Since `checkPermission` always performs a live tuple lookup, revoking a `full_access` tuple takes effect immediately for all subsequent `checkPermission` calls. JWTs already issued with `client_full_access` claim remain valid until expiry (15 minutes). This is acceptable for the initial implementation. Token revocation on demand requires token introspection infrastructure which is out of scope.

---

## 11. Observability and Metrics

### 11.1 Existing Metrics to Update

`PermissionService.checkPermission` already emits:
- `authz.decision.count` with `result` and `source` tags
- `authz.check.duration_ms` with `result` and `entity_type` tags

The new fast path must emit:
```typescript
void metricsService.count("authz.decision.count", 1, {
  result: "allowed",
  source: "client_full_access",  // new source tag value
});
```

### 11.2 New Metrics

- `apikey.exchange.client_full_access_count` - count of tokens issued with `client_full_access` claim.
- `authz.client_full_access.grant_count` - count of active `full_access` tuples per client (computed, not incremental).

### 11.3 Audit Events

The webhook events `grant.created` and `grant.revoked` with `relation: "full_access"` and `entityType: "oauth_client"` serve as audit events for grant/revoke operations. No separate audit log is required for the initial implementation.

---

## 12. Backlog

Each item below is a discrete, independently verifiable unit of work.

---

### BL-01: `TupleRepository` - Add `findBySubjectAndEntityTypeAndRelation`

**File:** `src/lib/repositories/tuple-repository.ts`

**What:** Add a focused query method used by `resolveClientFullAccess`.

```typescript
async findBySubjectAndEntityTypeAndRelation(
  subjectType: string,
  subjectId: string,
  entityType: string,
  relation: string
): Promise<Tuple[]>
```

**Acceptance criteria:**
- Method returns all tuples matching all four parameters.
- Throws on DB error (fail-closed, like `findBySubjectStrict`).
- Unit test: returns correct tuples when one match and one non-match exist.

---

### BL-02: `PermissionService` - Add `extractClientIdFromEntityType` and `full_access` fast path

**File:** `src/lib/auth/permission-service.ts`

**What:** Insert the client-wide access bypass between steps 0 and 1 of `checkPermission`.

**Acceptance criteria:**
- `checkPermission("apikey", keyId, "client_abc:invoice", "inv_1", "read")` returns `true` when a `full_access` tuple exists for `oauth_client / abc / full_access / apikey / keyId`.
- Same check returns `false` when no `full_access` tuple exists and no scoped tuples exist.
- Check for `client_abc:invoice` does NOT bypass when the `full_access` grant is for `client_xyz`.
- Check for `oauth_client` entity type itself does NOT trigger the fast path (extractClientIdFromEntityType returns null for it).
- Metrics emitted with `source: "client_full_access"` on bypass.
- Unit tests cover: direct grant, group-inherited grant, wrong client denial, no grant fallthrough to scoped tuple check.

---

### BL-03: `PermissionService` - Group-Inherited `full_access` Test Coverage

**File:** `src/lib/auth/permission-service.ts` + test file

**What:** Verify that the `expandSubjects` BFS path correctly resolves `full_access` for a user whose group holds the grant.

**Acceptance criteria:**
- User is member of Group A. Group A has `full_access` on `oauth_client / clientId`. User's `checkPermission` call returns `true`.
- API key is member of Group A. Same.
- Removing the group's `full_access` tuple causes both checks to return `false`.

---

### BL-04: `check-permission` Route - Cross-Client API Key Scope Guard

**File:** `src/app/api/auth/check-permission/route.ts`

**What:** When `subjectType === 'apikey'`, validate that `entityType`'s client matches the API key's `metadata.oauth_client_id` before calling `checkPermission`.

**Acceptance criteria:**
- API key for `clientA` calling check-permission for `client_clientB:invoice` returns 403.
- API key for `clientA` calling check-permission for `client_clientA:invoice` proceeds normally.
- Non-client-scoped entity types (e.g., legacy plain types) pass through without blocking (extractClientIdFromEntityType returns null).

---

### BL-05: `ApiKeyPermissionResolver` - Add `resolveClientFullAccess`

**File:** `src/lib/services/api-key-permission-resolver.ts`

**What:** New method that returns client IDs where the API key (or its groups) holds a `full_access` grant.

**Acceptance criteria:**
- Returns `["clientA"]` when API key has direct `full_access` on clientA.
- Returns `["clientA"]` when API key is a member of a group that has `full_access` on clientA.
- Returns `[]` when no `full_access` grants exist.
- Returns multiple client IDs when grants exist for multiple clients.

---

### BL-06: API Key Exchange Route - Emit `client_full_access` JWT Claim

**File:** `src/app/api/auth/api-key/exchange/route.ts`

**What:** Call `apiKeyPermissionResolver.resolveClientFullAccess(apiKeyRecord.id)` and embed result as `client_full_access` claim in the JWT.

**Acceptance criteria:**
- JWT contains `client_full_access: ["clientA"]` when the key has a `full_access` grant.
- JWT omits `client_full_access` (or sets it to `undefined`) when no grants exist.
- Existing `permissions` and `abac_required` claims are unaffected.
- Integration test: exchange a full-access key, decode the JWT, assert `client_full_access` contains the correct client ID.

---

### BL-07: `TupleRepository` - Webhook Parity for `full_access` API Key Tuples

**File:** `src/lib/repositories/tuple-repository.ts` + `src/lib/webhooks/grant-events.ts`

**What:**
1. Update `shouldEmitGrantWebhook` to emit for `subjectType='apikey'` only when `entityType='oauth_client'` and `relation='full_access'`.
2. Update `GrantSubjectType` in grant-events.ts to include `"apikey"`.

**Acceptance criteria:**
- Granting `full_access` for an API key emits `grant.created` event with `subjectType: "apikey"`.
- Revoking `full_access` for an API key emits `grant.revoked` event.
- Granting a normal scoped tuple for an API key does NOT emit a webhook event (existing behavior preserved).
- Webhook subscriber receives the event with correct `tupleId`, `entityType: "oauth_client"`, `entityId: clientId`, `relation: "full_access"`.

---

### BL-08: Server Action - `grantClientWideAccess`

**File:** `src/app/admin/clients/[id]/access/actions.ts`

**What:** New server action that writes one `full_access` tuple.

**Acceptance criteria:**
- Requires `canManageAccess === true`. Returns error for unauthorized callers.
- Idempotent: calling twice does not error and does not duplicate the tuple.
- Supports `subjectType: "user" | "group" | "apikey"`.
- When `subjectType === "apikey"`: validates the API key exists and has `metadata.oauth_client_id === clientId`. Returns error if not found or mismatched.

---

### BL-09: Server Action - `revokeClientWideAccess`

**File:** `src/app/admin/clients/[id]/access/actions.ts`

**What:** New server action that deletes one `full_access` tuple.

**Acceptance criteria:**
- Requires `canManageAccess === true`.
- Returns `success: false` with a descriptive error if no tuple exists.
- Does not cascade to scoped tuples (those remain intact after revoking `full_access`).

---

### BL-10: Server Action - `listClientWideAccess` and `checkClientWideAccess`

**File:** `src/app/admin/clients/[id]/access/actions.ts`

**What:** Utility actions for reading current `full_access` state.

**Acceptance criteria:**
- `listClientWideAccess` returns all `full_access` tuples for a client, filtered from the full `oauth_client` tuple set.
- `checkClientWideAccess` returns `true` only when an exact `full_access` tuple exists for the given subject.

---

### BL-11: `createClientApiKey` - `accessMode` Parameter

**File:** `src/app/admin/clients/[id]/access/actions.ts`

**What:** Extend `createApiKeySchema` with `accessMode: z.enum(["scoped", "full_access"])` and branch the tuple write logic.

**Acceptance criteria:**
- `accessMode: "full_access"` writes one `oauth_client / clientId / full_access / apikey / keyId` tuple.
- `accessMode: "scoped"` follows existing flow, unchanged.
- Sending `accessMode: "scoped"` without `permissions` is a validation error.
- Sending `accessMode: "full_access"` without `permissions` is valid.
- Rollback deletes the `full_access` tuple if the API key creation succeeds but the tuple write fails.

---

### BL-12: `getClientApiKeys` - Detect and Expose `accessMode`

**File:** `src/app/admin/clients/[id]/access/actions.ts`

**What:** Update the enrichment loop to detect `full_access` tuples on `oauth_client`.

**Type change:** The return type of `getClientApiKeys` gains `accessMode: "full_access" | "scoped"`. Update the inferred return type and all consumers.

**Acceptance criteria:**
- Keys with `full_access` tuple are returned with `accessMode: "full_access"` and `permissions: {}`.
- Keys without `full_access` tuple are returned with `accessMode: "scoped"` and their existing permissions map.
- TypeScript compiles without errors after the type change.
- `api-key-management.tsx` is updated to read `key.accessMode` (tracked in BL-14).

---

### BL-13: UI - `create-api-key-modal.tsx` Access Mode Selector

**File:** `src/components/admin/access-control/create-api-key-modal.tsx`

**What:** Add Access Mode radio group, conditional warning banner, and confirmation checkbox.

**Acceptance criteria:**
- Switching to "Full client access" hides the relation matrix.
- Warning banner is visible and non-dismissible.
- Create button is disabled until the confirmation checkbox is checked (full-access mode only).
- Sends `accessMode: "full_access"` | `"scoped"` to `createClientApiKey`.

---

### BL-14: UI - `api-key-management.tsx` Full Access Badge

**File:** `src/components/admin/access-control/api-key-management.tsx`

**What:** Display "Full Access" badge for keys with `accessMode === 'full_access'`.

**Acceptance criteria:**
- Badge visible for full-access keys in the permissions column.
- Scoped permission editing controls are disabled (or hidden) for full-access keys.
- Tooltip on badge explains what full access means.

---

### BL-15: UI - `scoped-permissions.tsx` Per-Subject Full Access Controls

**File:** `src/components/admin/access-control/scoped-permissions.tsx`

**What:** Add grant/revoke full-access actions to user and group subject rows.

**Acceptance criteria:**
- "Grant Full Client Access" button visible per row for users and groups.
- Confirmation dialog shows client name and subject display name before granting.
- "Full Access Active" badge visible on rows with active grant.
- "Revoke" action removes the grant and updates the badge.
- Calls `grantClientWideAccess` / `revokeClientWideAccess` server actions.

---

### BL-16: Metrics - `source: "client_full_access"` in `authz.decision.count`

**File:** `src/lib/auth/permission-service.ts`

**What:** Verify the new tag value flows through to the metrics system correctly.

**Acceptance criteria:**
- `metricsService.count("authz.decision.count", 1, { result: "allowed", source: "client_full_access" })` is called when the fast path allows.
- No duplicate metrics emission when fast path is taken (do not also emit from the normal scoped tuple path).

---

### BL-17: Tests - Integration Suite for Full Access End-to-End

**Test directory:** `tests/` at the workspace root. Look at existing test files in that directory to understand the test runner setup and fixture patterns before writing new tests.

**No feature flag required:** There is no feature flag infrastructure in this codebase. The feature is enabled by the code changes themselves. The tuple operations are the on/off switch - granting `full_access` enables it, revoking disables it immediately.

**What:** Integration tests covering the full flow.

**Acceptance criteria:**
- Create API key with `full_access`, call `checkPermission` for multiple entity types under that client, all return `true`.
- Revoke `full_access`, call `checkPermission`, returns `false` for entity types where no scoped tuples exist.
- Create API key with `full_access`, exchange for JWT, assert `client_full_access` claim present and correct.
- Cross-client check rejected at route layer before reaching `checkPermission`.
- User with group-inherited `full_access` passes `checkPermission` for client-scoped entity type.
- Scoped tuples for an API key are unaffected when its `full_access` grant is revoked (both can coexist).

---

## 13. Affected Files Reference

This section lists every file with a required change and a summary of what changes.

| File | Change |
|---|---|
| `src/lib/repositories/tuple-repository.ts` | Add `findBySubjectAndEntityTypeAndRelation`. Update `shouldEmitGrantWebhook` for apikey full_access scope. |
| `src/lib/webhooks/grant-events.ts` | Extend `GrantSubjectType` to include `"apikey"`. |
| `src/lib/auth/permission-service.ts` | Add `extractClientIdFromEntityType` as an **exported module-level function**. Insert `full_access` fast path in `checkPermission`. |
| `src/lib/services/api-key-permission-resolver.ts` | Add `resolveClientFullAccess` method. |
| `src/app/api/auth/api-key/exchange/route.ts` | Call `resolveClientFullAccess` and embed `client_full_access` claim. |
| `src/app/api/auth/check-permission/route.ts` | Add cross-client API key scope guard. |
| `src/app/admin/clients/[id]/access/actions.ts` | Add `grantClientWideAccess`, `revokeClientWideAccess`, `listClientWideAccess`, `checkClientWideAccess`. Extend `createClientApiKey` with `accessMode`. Update `getClientApiKeys` enrichment. |
| `src/components/admin/access-control/create-api-key-modal.tsx` | Access mode selector, warning banner, confirmation checkbox. |
| `src/components/admin/access-control/api-key-management.tsx` | Full Access badge and disabled scoped editing. |
| `src/components/admin/access-control/scoped-permissions.tsx` | Per-subject grant/revoke full access controls. |

