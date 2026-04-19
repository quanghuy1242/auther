# Authorization Architecture: Implementation Backlog

> Gaps identified from the revised architecture in `authz-local-projection-plan_detail.md`.
> Items are grouped by service and ordered roughly by dependency (earlier items unblock later ones).
> Cross-service dependencies are noted explicitly.

---

## Auther Backlog

### A1 — ListObjects API endpoint

**What**: Add `GET /api/auth/list-objects` (or equivalent) to Auther. Given a `userId` and `entityType`, return all entity IDs the user has at least a specified `permission` on, with an `abac_required` flag per entity ID.

**Why**: This is the missing primitive that everything else depends on. Without it, Payload has no way to do initial sync, reconciliation, or the Phase 0 fallback. It is also what enables Payload to avoid the existing N+1 pattern even without the mirror.

**Internal work**: expose `resolveAllPermissionsWithABACInfo` as a paginated external endpoint filtered by entity type. Group expansion and ABAC flagging already happen inside this method — this is an API surface addition, not a logic addition.

**Depends on**: nothing (foundational).

**Blocks**: Payload items P5, P7.

---

### A2 — Grant event types: `grant.created` and `grant.revoked`

**What**: Add two new event type constants to `WEBHOOK_EVENT_TYPES` in `src/lib/constants.ts` and wire them into the grant write path.

- `grant.created`: fires after a tuple is successfully written. Payload shape must include `tupleId`, `subjectType`, `subjectId`, `entityType`, `entityId`, `relation`, `hasCondition`.
- `grant.revoked`: fires after a tuple is deleted. Payload shape must include `tupleId`, `entityType`, `entityId`.

**Why**: the grant mirror is event-driven. Without these events, Payload has no signal to write or revoke mirror rows in near-real time. Reconciliation covers the gap but should be the fallback, not the primary sync path.

**Internal work**: add event types to the constant, add dispatch calls in the tuple write and delete paths, ensure the existing multi-webhook delivery infrastructure (`webhook-delivery` queue) fans these out to all subscribed endpoints.

**Depends on**: nothing (additive to existing webhook system).

**Blocks**: Payload items P2, P3.

---

### A3 — Group membership event types: `group.member.added` and `group.member.removed`

**What**: Add two new event type constants and wire them into the group membership write paths.

- `group.member.added`: fires when a user is added to a group. Payload shape: `groupId`, `userId`.
- `group.member.removed`: fires when a user is removed from a group. Payload shape: `groupId`, `userId`.

**Why**: group-derived mirror rows must be updated when membership changes. Without these events, a user removed from a group that has a book grant retains access in the mirror indefinitely — this is a security gap.

**Internal work**: same as A2 — constants, dispatch calls in membership write paths, delivery infrastructure reuse.

**Depends on**: nothing.

**Blocks**: Payload item P4.

---

### A4 — Members API for groups

**What**: Add or verify `GET /api/internal/groups/:groupId/members` returns the fully expanded (BFS-traversed) member list for a group, not just direct members.

**Why**: when Payload receives a `grant.created` event for a group subject, it calls this endpoint to expand the group into individual user IDs for mirror row writing. If the endpoint only returns direct members, nested group hierarchies are silently missed.

**Internal work**: check whether this endpoint already exists and whether it returns recursively expanded membership. If it only returns direct members, add a `?expand=true` or similar parameter that triggers the same BFS expansion used inside `expandSubjects`.

**Depends on**: nothing.

**Blocks**: Payload item P4.

---

### A5 — Optional: `grant.condition.updated` event

**What**: Add an event that fires when an existing tuple's Lua condition is added, changed, or removed.

**Why**: without this event, changing whether a grant has a condition requires a revoke-and-recreate of the tuple. The mirror handles revoke-and-recreate correctly, but it means the `requiresLiveCheck` flag can only change via a full grant lifecycle, not via an in-place update.

**Alternative**: if condition changes are always done via revoke-and-recreate operationally, this event is not needed. Document the convention clearly so operators don't try to patch conditions in place.

**Depends on**: A2 (same infrastructure).

**Blocks**: nothing critical; quality-of-life for operators.

---

### A6 — Optional: pagination on ListObjects

**What**: add cursor-based pagination to the ListObjects response for users with very large grant sets (e.g., many group memberships, each with many book grants).

**Why**: without pagination, the response size is unbounded. At current scale this is probably fine, but the API should be designed for pagination from the start to avoid a breaking change when scale increases.

**Depends on**: A1.

**Blocks**: nothing at current scale.

---

### A7 — Client-scoped grants CRUD API (`/api/internal/clients/:clientId/grants`)

**What**: Add (or verify) three endpoints scoped to a client ID, all protected by `x-api-key`:

- `GET /api/internal/clients/:clientId/grants?entityTypeName=book&entityId=:id` — return all active grant tuples for the given entity, with at minimum `tupleId`, `relation`, `userEmail`, `userId` per record.
- `POST /api/internal/clients/:clientId/grants` — create a grant tuple. Body must accept:
  - user subject: `{ entityTypeName, entityId, relation, subjectType: "user", subjectEmail }`
  - group subject: `{ entityTypeName, entityId, relation, subjectType: "group", subjectId }`
  Returns `{ ok: true }` on success.
- `DELETE /api/internal/clients/:clientId/grants/:tupleId` — revoke a specific tuple by its ID. Returns `{ ok: true }` on success.

**Why**: `src/app/api/books/[id]/access/route.ts` in PayloadCMS is already calling all three of these endpoints to power the book-level grant management UI. If they do not exist or the shape differs, that admin UI is broken.

**Auth**: all three must validate the `x-api-key` header against the stored client API key. Requests with a mismatched or missing key must return 401/403.

**Internal work**: check whether these routes already exist under the internal router. If they do, verify the response shapes match what Payload expects (`grants[]` for GET, `{ ok }` for POST/DELETE). If they don't exist, add them wired to the existing tuple read/write logic.

**Depends on**: nothing (uses existing tuple storage).

**Blocks**: book grant management UI in PayloadCMS admin (`src/app/api/books/[id]/access/route.ts`).

---

### A8 — Batch check-permission endpoint (`/api/auth/check-permission/batch`)

**What**: Add `POST /api/auth/check-permission/batch` to Auther. Given a session token (Bearer), an `entityType`, a list of `entityIds`, a `permission`, and an optional ABAC `context` object, return a map of `{ [entityId]: boolean }` indicating whether the authenticated user has the permission on each entity.

Expected request body:
```json
{ "entityType": "client_xyz:book", "entityIds": ["1", "2", "3"], "permission": "view", "context": {} }
```
Expected response:
```json
{ "results": { "1": true, "2": false, "3": true } }
```

**Why**: the existing single `POST /api/auth/check-permission` is used for point checks (one entity at a time). For conditioned grants (`requiresLiveCheck = true`), Payload needs to evaluate ABAC conditions across multiple entity IDs in a single call to avoid an N+1 against Auther at read time. `src/utils/grantMirror.ts` (`checkPermissionBatch`) already calls this endpoint — if it does not exist, all conditioned grants are silently denied.

**Auth**: Bearer token (session token), not `x-api-key`. The user identity is derived from the token.

**Internal work**: check whether this endpoint already exists. If not, add it as a thin loop over the existing single `check-permission` evaluation logic, or preferably as a vectorised evaluation path if the internal evaluator supports it.

**Depends on**: nothing (extends existing check-permission logic).

**Blocks**: ABAC live-check path in Payload's mirror read flow (`src/utils/grantMirror.ts` → `checkPermissionBatch`).

---

### A9 — Optional entity filter on client grants list (`GET /api/internal/clients/:clientId/grants`)

**What**: Make `entityTypeName` and `entityId` optional query parameters on `GET /api/internal/clients/:clientId/grants`. When both are omitted, return all grant tuples for the client (paginated). When provided, filter as today.

Expected response shape (same as the filtered case, paginated):
```json
{ "grants": [...], "nextCursor": "...", "hasMore": true }
```

**Why**: the reconciliation job (`P7`) and a future cold-start bootstrap job (`P11`) need to enumerate all subjects that hold any grant for this client without knowing the entity IDs in advance. The current endpoint requires both `entityTypeName` and `entityId`, which forces the caller to iterate all known book IDs first — an O(books) fan-out with no way to discover grants for entity IDs not yet known to Payload. Making the filter optional allows a single paginated sweep to seed the mirror from scratch.

**Auth**: same `x-api-key` validation as today.

**Internal work**: remove the `required` guard on `entityTypeName`/`entityId`; when absent, call `tupleRepository.findAllByClientId(clientId)` (or equivalent) with cursor-based pagination.

**Depends on**: nothing (additive change to existing endpoint).

**Blocks**: Payload item P11.

---

### A10 — Optional: inline relation metadata on ListObjects tuples (`GET/POST /api/auth/list-objects`)

**What**: extend the `ListObjectsItem` response shape from Auther so each entity item includes a `tuples` array with relation metadata for every contributing tuple, not just `tupleIds`.

Expected response item shape:
```json
{
  "entityId": "book_123",
  "abac_required": true,
  "abacRequired": true,
  "tupleIds": ["tpl_1", "tpl_2"],
  "tupleId": "tpl_1",
  "tuples": [
    { "tupleId": "tpl_1", "relation": "viewer" },
    { "tupleId": "tpl_2", "relation": "editor" }
  ]
}
```

**Why**: Payload now recovers exact `relation` values during bootstrap/reconciliation by combining A9's client grants sweep with ListObjects. Inline relation metadata on ListObjects would still be useful because it removes that extra enrichment dependency and lets event-driven consumers rely on a single API response.

**Auther code impact**:
- `src/lib/auth/permission-service.ts`: `ListObjectsItem` currently exposes only `entityId`, `abac_required`, and `tupleIds`. The folding logic in `listObjectsWithABACInfo()` already iterates full `Tuple` rows from `TupleRepository.findBySubjectsAndEntityTypeStrict()`, so `tuple.relation` is already in memory. The accumulator should preserve it instead of discarding it.
- `src/app/api/auth/list-objects/route.ts`: `mapListObjectItem()` must pass through the new `tuples` array while keeping the existing compatibility fields `tupleIds` and `tupleId`.

**Backward compatibility**: keep `tupleIds` and `tupleId` in the response. Add `tuples`; do not replace the existing fields yet.

**Depends on**: A1.

**Blocks**: nothing critical after A9-based enrichment is in place; optimization for simpler consumers and lower coupling.

---

### A11 — Optional: inline subject provenance on ListObjects tuples (`GET/POST /api/auth/list-objects`)

**What**: extend the same `tuples` array from A10 so each tuple entry includes the original tuple subject fields from Auther storage:

- `subjectType`: `user` or `group`
- `subjectId`: the original Auther user ID or group ID
- `subjectRelation`: optional, if present on the tuple and useful to downstream consumers

Expected response item shape:
```json
{
  "entityId": "book_123",
  "abac_required": false,
  "abacRequired": false,
  "tupleIds": ["tpl_group_1", "tpl_user_1"],
  "tupleId": "tpl_group_1",
  "tuples": [
    {
      "tupleId": "tpl_group_1",
      "relation": "viewer",
      "subjectType": "group",
      "subjectId": "grp_premium"
    },
    {
      "tupleId": "tpl_user_1",
      "relation": "editor",
      "subjectType": "user",
      "subjectId": "usr_123"
    }
  ]
}
```

**Semantics requirement**: these fields must describe the **original tuple row**, not the user that ListObjects is currently evaluating for. If a user reaches an entity through a group grant, the tuple entry must remain `subjectType = 'group'` with that group's ID. The response must not collapse provenance to the requesting user.

**Why**: Payload now recovers exact `sourceSubjectType` during bootstrap/reconciliation by combining A9's client grants sweep with ListObjects. Inline provenance on ListObjects would still be useful because it would let event-driven consumers avoid additional tuple metadata lookups and keep all effective-grant information in one response.

**Auther code impact**:
- `src/lib/repositories/tuple-repository.ts`: the `Tuple` type already has `subjectType`, `subjectId`, and optional `subjectRelation`.
- `src/lib/auth/permission-service.ts`: `listObjectsWithABACInfo()` already has those tuple rows in hand, so this is a response-shape extension, not a new data fetch.
- `src/app/api/auth/list-objects/route.ts`: expose the new per-tuple provenance fields in both GET and POST responses.

**Backward compatibility**: same as A10. Add `tuples`; keep `tupleIds` and `tupleId` unchanged.

**Depends on**: A10 can ship in the same PR, but if split, A11 depends on A10's `tuples` array existing.

**Blocks**: nothing critical after A9-based enrichment is in place; optimization for simpler consumers and lower coupling.

---

## PayloadCMS Backlog

### P1 — Grant mirror collection schema

**What**: create a new Payload collection (`GrantMirror` or `BookAccessGrants`) with the following fields:

| Field | Type | Notes |
|---|---|---|
| `autherTupleId` | text | indexed, used as idempotency key |
| `payloadUserId` | relationship → Users | indexed |
| `entityType` | text (enum) | `book`, `chapter`, `comment`, etc. — generic from the start |
| `entityId` | text | the local Payload entity ID as a string |
| `relation` | text | e.g., `viewer`, `editor`, `owner` |
| `sourceSubjectType` | text (enum) | `user` or `group` |
| `requiresLiveCheck` | checkbox | default false |
| `syncStatus` | text (enum) | `active`, `revoked`, `pending` |
| `syncedAt` | date | updated by every sync operation |

Composite index on `(payloadUserId, entityType, syncStatus)`. Index on `autherTupleId`. Index on `(sourceSubjectType, payloadUserId)`.

**Migration needed**: yes — new collection, no existing data to migrate.

**Depends on**: nothing (schema work, no cross-service dependency).

**Blocks**: P2, P3, P4, P6.

---

### P2 — Inbound webhook handler for grant events

**What**: add a handler in Payload's inbound webhook route that processes `grant.created` and `grant.revoked` events from Auther.

For `grant.created`:
1. Verify the Auther webhook signature.
2. If `subjectType === 'user'`: resolve `subjectId` to a local `payloadUserId` via the `betterAuthUserId` field on the Users collection. If no user found, enqueue a deferred job (see P8). If user found, upsert a mirror row by `(autherTupleId, payloadUserId)`.
3. If `subjectType === 'group'`: call Auther's members API (A4) to expand the group, then upsert one mirror row per member.

For `grant.revoked`:
1. Find all mirror rows with `autherTupleId` matching the event.
2. Set `syncStatus = revoked` on all of them.

Both handlers must be idempotent by design (upsert semantics, no-op on duplicate revoke).

**Depends on**: P1 (schema), A2 (Auther fires events).

**Blocks**: P6.

---

### P3 — Inbound webhook handler for group membership events

**What**: add handlers for `group.member.added` and `group.member.removed`.

For `group.member.added`:
1. Find all active mirror rows where `sourceSubjectType = 'group'` and `autherTupleId` matches any grant tuple for the group. (Requires querying Auther for grant tuples for this group, or maintaining a local index of groupId → tupleIds — this is the tricky part to design.)
2. For each matched tuple, upsert a new mirror row for the new user.

For `group.member.removed`:
1. Find all mirror rows where `sourceSubjectType = 'group'` and `payloadUserId` matches the leaving user.
2. Cross-reference against still-active group grants for that user (a user may be in multiple groups; only remove rows where this specific group was the sole source). This may require a call to Auther's ListObjects to verify what the user still has access to.
3. Revoke rows that are no longer supported.

**Note**: the group membership handler is the most complex write path. A safe conservative implementation is to trigger a per-user reconciliation (call ListObjects for the affected user and diff against their mirror rows) rather than doing fine-grained row manipulation. This is slower but correct and simpler to implement initially.

**Depends on**: P1, A3 (membership events), A4 (members API or ListObjects).

---

### P4 — Updated `access.ts` read path

**What**: replace the current N+1 `checkAutherBookAccess` loop in `access.ts` with a mirror-based read path.

New flow:
1. Query the mirror for all active rows where `payloadUserId = userId` and `entityType = 'book'`.
2. Partition results into unconditional (no live check needed) and conditional sets.
3. For the conditional set, assemble context and call Auther's `check-permission` batch.
4. Build the combined filter: public books OR owned books OR `id IN [unconditional ∪ approved-conditional]`.
5. Cache the result in the existing `WeakMap<PayloadRequest, Promise<...>>` cache.

**Depends on**: P1, P2 (mirror must be populated before this path can work).

**Note**: during the transition period, the old N+1 path can be kept as a fallback behind a feature flag or an environment variable.

---

### P5 — `afterDelete` hook on Books collection

**What**: add an `afterDelete` hook to `src/collections/Books.ts` that, on hard delete of a book, synchronously deletes or revokes all mirror rows where `entityType = 'book'` and `entityId = deletedBookId`.

**Why**: prevents ghost rows from lingering in the mirror after a book is deleted. The read filter would never return a deleted book from the database anyway, but ghost rows consume index space and show up misleadingly in reconciliation diffs.

**Depends on**: P1.

---

### P6 — `afterOperation` hook on Users collection for deferred grant drain

**What**: add an `afterOperation` hook on the Users collection that fires after a new user is created (i.e., after `upsertBetterAuthUser` creates the local record for the first time). The hook checks for pending deferred grant jobs for that user's `betterAuthUserId` and processes them, writing the mirror rows.

**Why**: grants may be created in Auther for a user before that user has ever made a request to Payload. The webhook handler for `grant.created` cannot write the mirror row without a local user ID. The deferred queue (P8) parks the grant data until the user exists; this hook is the drain point.

**Depends on**: P1, P8.

---

### P7 — Reconciliation job

**What**: a job (initially a manually triggered admin action, later schedulable) that calls Auther's ListObjects API for all users with any mirror entries, diffs the results against the current mirror state, and corrects divergences.

Corrections:
- Rows in Auther but not in mirror: insert.
- Rows in mirror as active but absent from Auther: revoke.
- Rows where `requiresLiveCheck` flag differs from Auther's `abac_required`: update flag.

The job must be resumable (checkpoint by user ID or page cursor) and idempotent.

**Depends on**: P1, A1 (ListObjects endpoint).

---

### P8 — Deferred grant queue for pre-provisioned users

**What**: when the `grant.created` webhook handler cannot resolve a Better Auth user ID to a Payload user, enqueue the raw grant event data as a deferred job using the QStash pattern (same as Auther's `webhook-delivery` queue route: enqueue to QStash, QStash delivers to a Payload queue endpoint, the endpoint processes the job with retries).

The queue endpoint:
1. Tries to resolve the `betterAuthUserId` to a Payload user.
2. If the user now exists: write the mirror row and ack.
3. If the user still does not exist: return 500 to trigger QStash retry with backoff.

The deferred job expires after a configurable window (e.g., 7 days) with an alert if the user never appeared.

**Depends on**: P1, A2 (grant events).

**Note**: this reuses the existing Upstash/QStash infrastructure already in use in Auther. No new queue infrastructure is needed.

---

### P9 — BookAccessPanel: group grant support

**What**: update the BookAccessPanel admin component to support selecting a group as the grant subject in addition to an individual user email.

UX decision needed (not architectural): toggle between user and group subject type, a separate panel section, or a unified input that resolves to either.

**Depends on**: P2 (group grants must be handled on ingest before the UI needs to expose them).

---

### P10 — Admin UI: reconciliation trigger

**What**: add a button or action in Payload admin (e.g., on the Book document or on a global settings page) that triggers the reconciliation job on demand.

**Depends on**: P7.

---

### P11 — Cold-start bootstrap: seed mirror from pre-existing Auther grants

**What**: add a bootstrap step (can be a one-off admin action or an extension of the reconciliation job) that seeds the grant mirror from Auther's full grant set for users Payload does not yet know about.

Flow:
1. Call `GET /api/internal/clients/:clientId/grants` with no entity filter (A9) to page all grant tuples.
2. For each tuple, resolve the `subjectId` to a Payload user via `betterAuthUserId`.
3. If the user exists: call `upsertGrantMirrorRow` as normal.
4. If the user does **not** exist: call `enqueueDeferredGrantJob` (same as P2/P8) so the grant is applied when the user first logs in.

**Why**: grants created in Auther's admin UI before Payload's webhook subscription was active — or before any user had logged into Payload — are invisible to the event-driven path and invisible to the current reconciliation job (which only iterates users already in Payload). This bootstrap step is the one-time seed that makes the mirror authoritative from day one of deployment, not just from the moment the first user logs in.

**Note**: this job is idempotent — re-running it produces the same mirror state. It is safe to run alongside live traffic. For large grant sets it should be paginated and resumable using the same checkpoint pattern as P7.

**Depends on**: A9 (unfiltered grants endpoint), P1 (mirror schema), P8 (deferred grant queue).

**Blocks**: nothing (correctness improvement for the cold-start window).

---

### P12 — Reconciliation must enqueue deferred grants for unresolvable users

**What**: update `src/app/api/internal/reconcile/route.ts` so that when a grant tuple from Auther cannot be matched to a Payload user (i.e., `resolvePayloadUserId` returns null), the reconciliation job calls `enqueueDeferredGrantJob` instead of silently skipping.

**Why**: the current reconciliation job only iterates users already in `payload.users`. A user pre-provisioned access in Auther who has never logged into Payload has no local record, so reconciliation walks straight past them. The webhook handler (P2) correctly enqueues deferred grants for unknown users — reconciliation must do the same to close the gap. Recovery path is identical: user logs in → `upsertBetterAuthUser` creates the record → P6 drain hook processes queued deferred grants → mirror rows written.

**Scope**: single change in `reconcile/route.ts` — add a `resolvePayloadUserId` call inside the per-tuple loop and branch to `enqueueDeferredGrantJob` on null. Reuses existing infrastructure; no new collections or queue workers needed.

**Depends on**: P7 (reconciliation job exists), P8 (deferred queue exists).

**Blocks**: Gap 2 (pre-provisioned users invisible to reconciliation).

---

### P13 — ABAC context assembly before `checkPermissionBatch`

**What**: define and populate a context object before calling `checkPermissionBatch` in `src/utils/access.ts`. Currently the call is `checkPermissionBatch({ ..., context: {} })` with a `TODO` comment. The context must include any fields that Auther's Lua conditions inspect at evaluation time.

Minimum required:
1. Document which context fields each active Lua condition in Auther expects (owner responsibility; checked at grant-authoring time).
2. In `getGrantedPrivateBookIds`, assemble a context map before the batch call. At minimum this will include any purchase/entitlement data when that collection is available.
3. Until a purchase collection exists, the context can remain `{}` — but the `TODO` must be turned into a tracked task so it is not forgotten when entitlements are added.

**Why**: any Lua condition that inspects `context` fields currently always sees an empty object and therefore always evaluates to the deny branch. This is a silent false denial — no error is thrown, the user simply does not see the book. For unconditional grants this is harmless. For any grant where the admin explicitly attached a Lua condition expecting context, the condition is permanently failing.

**Depends on**: P4 (mirror read path must be in place), a future entitlements/purchase collection.

**Blocks**: correctness of all conditioned grants that require runtime context.

---

### P14 — Revocation tombstone TTL / cleanup

**What**: add a TTL or scheduled cleanup for `type: 'revocation_tombstone'` entries in the `deferred-grants` collection. Tombstones are written when `grant.revoked` arrives before the corresponding `grant.created` has been processed (out-of-order protection). They are never deleted today and accumulate indefinitely.

Proposed cleanup: during the reconciliation job (P7), or in a separate periodic task, delete tombstone entries older than a configurable window (e.g. 48 hours — matching the webhook idempotency TTL on the Auther side). Any out-of-order `grant.created` that arrives later than 48 hours after its `grant.revoked` is already outside Auther's retry window and will never be re-delivered, so the tombstone serves no further purpose.

**Why**: storage leak — every out-of-order event pair leaves a permanent row. At current scale this is negligible, but it makes the `deferred-grants` collection misleading for debugging and wastes index space over time.

**Scope**: add a cleanup pass at the end of the reconciliation job, or add a Payload scheduled task. No schema changes needed.

**Depends on**: P7 (reconciliation job as the natural home for the cleanup).

**Blocks**: nothing critical; operational hygiene.

---

## Cross-Service Dependency Summary

```
A1 ──────────────────────────────────────────────► P7
A2 ──────► P2 ──────► P4
              └──────► P6 ◄── P8
A3 ──────► P3
A4 ──────► P2
           └──────► P3
A9 ──────► P11
A10 + A11 ─► optional optimization: inline tuple metadata in ListObjects so consumers need less A9 enrichment
P1 ◄──── all Payload items
P5 is standalone (Payload-only hook)
P8 ──────► P6 (P6 drains what P8 parks)
        ◄── P11 (bootstrap enqueues via P8)
        ◄── P12 (reconciliation enqueues via P8)
P7 ──────► P14 (tombstone cleanup lives in reconciliation)
P13 depends on P4 + future entitlements collection
```

## Implementation Order Recommendation

1. **P1**: schema (unblocks everything else in Payload)
2. **A2 + A3**: grant and membership events in Auther (unblocks P2, P3)
3. **A4**: verify/fix members API (unblocks P2 group path, P3)
4. **P2**: inbound grant event handler (core sync path)
5. **P5**: afterDelete hook on Books (simple, low-risk)
6. **P8 + P6**: deferred grant queue and user creation drain (handles pre-provisioned users)
7. **P4**: updated access.ts read path (completes the hot path)
8. **A1**: ListObjects endpoint in Auther
9. **P7**: reconciliation job
10. **P3**: group membership event handler (most complex, can run in parallel with P7)
11. **P9 + P10**: admin UI improvements
12. **A9**: optional entity filter on grants list (Auther — unblocks P11)
13. **P11**: cold-start bootstrap (run once after A9 is deployed)
14. **P12**: reconciliation deferred-grant enqueue (small patch to existing reconcile route)
15. **A10 + A11**: optional optimization to inline per-tuple relation and provenance metadata directly in ListObjects
16. **P14**: tombstone cleanup (add to P7 reconciliation job)
17. **P13**: ABAC context assembly (blocked on entitlements collection — tackle when that lands)
