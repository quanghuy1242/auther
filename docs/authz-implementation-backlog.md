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

## Cross-Service Dependency Summary

```
A1 ──────────────────────────────────────────────► P7
A2 ──────► P2 ──────► P4
              └──────► P6 ◄── P8
A3 ──────► P3
A4 ──────► P2
           └──────► P3
P1 ◄──── all Payload items
P5 is standalone (Payload-only hook)
P8 ──────► P6 (P6 drains what P8 parks)
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
11. **P9 + P10**: admin UI improvements (last, lower priority)
