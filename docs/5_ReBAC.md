# Users and Groups Access Control with ReBAC

## Overview

Transition the application's access control from simple role-based logic (RBAC) to a Relationship-Based Access Control (ReBAC) model. This will enable fine-grained permissions for specific resources (e.g., specific OAuth Clients, Webhooks) and support hierarchical access inheritance (e.g., User inherits permissions from Group).

We will implement a "Tuple Store" architecture where all permissions are stored as `(Entity, Relation, Subject)` triples, alongside a graph traversal engine to resolve access checks.

**Key Requirement:** This system MUST support "Specific Row/Resource" authorization. The engine must be able to verify if a user can access a specific resource ID while denying access to others.

## Recommended Tech Stack

*   **Storage:** Single unified table (e.g., `access_tuples`) in SQLite/Drizzle to store relationships.
*   **Logic:** TypeScript-based "Graph Resolver" service to interpret relationships and traverse the graph.
*   **Configuration:** JSON-based authorization model defining valid entities and transitive rules.

## Authorization Architecture

### 1. Two Permission Layers

To handle OAuth client scenarios effectively, we divide permissions into two distinct layers:

#### Layer A: Client Access (Platform Level)
Controls who can manage or use a specific OAuth client instance.
*   **Namespace:** `platform`
*   **Relations:** `use`, `admin`, `owner`
*   **Example:** Alice is an `admin` of Client #123. Engineering Group can `use` Client #456.

#### Layer B: Scoped Permissions (Application Level)
Defines what a user is allowed to do *within* the specific client application.
*   **Namespace:** `client_{clientId}`
*   **Relations:** Domain-specific actions (e.g., `invoice:read`, `payment:process`).
*   **Example:** Bob has `read` permission for `invoices` in the Payment App.

### 2. ReBAC Core Components

#### The Tuple Store
A unified database table responsible for storing all access relationships. It should support:
*   **Direct Assignments:** User U has Relation R on Entity E.
*   **Wildcards:** User U has Relation R on *ALL* entities of type T.
*   **Grouping:** Group G has Relation R; User U is a member of Group G.
*   **API Keys (Full ReBAC):** API Keys are treated as first-class "Subjects". An API Key K can be granted Relation R on Entity E (or `*`). This unifies the logic: checking an API Key's permission is identical to checking a User's permission.

#### The Authorization Model
A configuration store (likely database-backed) that defines the valid "schema" for permissions.
*   **Entity Types:** What objects exist (e.g., `client`, `invoice`, `group`).
*   **Relations:** What links are possible (e.g., `owner`, `editor`, `viewer`).
*   **Transitivity:** Rules like "Owner implies Editor" or "Editor implies Viewer".

#### The Resolution Engine (Permission Service)
A service responsible for answering "Can Subject S perform Action A on Resource R?".
It must perform the following checks in order:
1.  **Direct Tuple Check:** Is there an exact match?
2.  **Wildcard Check:** Is there a global grant for this entity type?
3.  **Transitivity Check:** Does the user have a "higher" role that implies this permission?
4.  **Hierarchy Check:** Does the user belong to a Group that has this permission? (Recursive)
5.  **Policy Check (ABAC):** If Attribute-Based Access Control is enabled (e.g., Lua scripts), evaluate the specific policy rules using context from the resource.

#### Dependency Safety (The "Referential Integrity" of Auth)
Because permissions are now graph-based, we must prevent "dangling references" or schema breaks.
*   **Model Updates:** Before removing a Relation definition (e.g., `invoice:read`) from the Authorization Model, the service **MUST** query the Tuple Store to ensure no active User, Group, or API Key currently holds that permission.
*   **Rejection:** If any active tuple relies on the definition, the update must be rejected with a clear error listing the dependencies (e.g., "Cannot remove 'read'; 5 active API keys depend on it").

### 3. Attribute-Based Access Control (ABAC) Integration

To support complex rules (e.g., "Users can only edit their *own* invoices" or "Admins can only refund < $1000"), we will integrate a policy engine (e.g., using Lua or a sandboxed logic evaluator).

*   **Hybrid Approach:** Use ReBAC tuples for high-level access (Role/Group membership) and ABAC policies for fine-grained runtime checks.
*   **Context Providers:** The system needs a mechanism to fetch "attributes" (like resource status, owner ID, current time) to feed into the policy evaluator. This can be achieved via webhooks or internal data fetchers.

## Compatibility & Safety Strategy

Transitioning to ReBAC represents a fundamental shift. We must ensure existing functionality, especially API Keys, continues to work securely.

*   **Unified Storage Goal:** The end state must replace scattered access tables with the single Tuple Store.
    *   **API Keys:** Instead of storing a JSON blob of permissions, API Keys will simply have Tuples associated with their ID in the `access_tuples` table.
    *   **Validation (Verify-then-Check Pattern):** Since `better-auth` does not support custom permission hooks, we decouple the process:
        1.  **Verify:** Call `auth.api.verifyApiKey` *without* passing a permissions object. This strictly checks key validity and expiration.
        2.  **Check:** Use the returned `userId` (or `apiKeyId`) to call `PermissionService.checkPermission(...)`, resolving access against the `access_tuples` table.
*   **Data Mapping:** Existing permissions need to be translated into the new Tuple format `(Entity, Relation, Subject)`.
*   **Zero Downtime:** Consider a strategy that allows reading from the new system while verifying against the old one (shadow mode).
*   **Codebase Refactoring:** The repository layer will need significant updates. Identify all "access check" call sites early.

## User Interface Requirements

### Admin Console Updates
*   **Client List:** Filter the list of clients based on what the administrator is actually allowed to see/manage.
*   **Access Control Tab:**
    *   **Platform Access:** Assign Users/Groups to Roles (Admin, Viewer).
    *   **Authorization Model:** Edit resource/relation definitions (protected by the Dependency Safety check).
    *   **Scoped Permissions:** Assign specific internal permissions.
*   **Resource Picker (Critical):**
    *   To support "Specific Resource" assignment, the UI must evolve beyond simple dropdowns.
    *   **User/Group Picker:** Existing component is sufficient.
    *   **Entity/Resource Picker:** A new component that adapts to the "Entity Type".
        *   *Mode 1 (Wildcard):* "All Invoices" (Default).
        *   *Mode 2 (Specific ID):* "Invoice #..." (Text input with validation).
        *   *Mode 3 (Search - Future):* If an external "Resource Provider" API is configured, allow searching for remote entities (e.g., searching a User in the database).
    *   **Convenience:** The picker should default to "Wildcard" to keep the common case fast (`invoice:*`), but easily toggle to "Specific" mode without navigating away.

### Developer Experience
*   Provide clear APIs for developers to register their application's Authorization Model.
*   Tools to test permissions (e.g., "Explain why Alice cannot edit this invoice").

## Implementation Tasks

1.  **Schema & Models** (Completed)
    *   Create `src/db/rebac-schema.ts` with `access_tuples` and `authorization_models` tables.
    *   Export new tables in `src/db/schema.ts`.
    *   Run database migration.
    *   **Schema Details:**
        *   `access_tuples`: Stores `(entityType, entityId, relation, subjectType, subjectId, subjectRelation)`. Supports wildcards (`*`) and Zanzibar-style subject sets.
        *   `authorization_models`: Stores JSON definitions of entity relations and permissions.
        *   **Validation:** `src/schemas/rebac.ts` defines strict Zod schemas for the Authorization Model JSON structure.
        *   **ABAC Support:** The `definition` JSON field supports embedding Lua scripts for attribute-based checks (e.g., `{ "policyEngine": "lua", "policy": "..." }`).

2.  **Core Services** (Completed)
    *   Implement `TupleRepository` for low-level DB operations.
    *   Implement `AuthorizationModelService` for managing schema definitions and checking dependencies.
    *   Implement `PermissionService` (The Resolution Engine) handling graph traversal, wildcards, and transitivity.
    *   **Implementation Details:**
        *   `TupleRepository`: Handles CRUD for `access_tuples` and includes `countByRelation` for dependency safety. Uses `crypto.randomUUID()` for IDs.
        *   `AuthorizationModelService`: Manages `authorization_models`. Validates JSON against Zod schema (`authorizationModelSchema`). Implements `checkDependencySafety` to prevent removing relations that are in use.
        *   `PermissionService`: The central engine.
            *   **Resolution Logic:** `Direct Match` -> `Wildcard Match` -> `Transitivity` (BFS traversal of relation graph) -> `Hierarchy` (User -> UserGroup -> Nested Group expansion via BFS).
            *   **ABAC:** Fully implemented using `wasmoon`. Includes `LuaPolicyEngine` with connection pooling to reuse Lua states for performance.

3.  **Admin UI Components**
    *   Develop `ResourcePicker` component (Wildcard vs. Specific ID).
    *   Update `AccessControlClient` to use the new services.
    *   Implement "Platform Access" section (User/Group -> Client Roles).
    *   Implement "Scoped Permissions" section (User/Group -> Client Resources).

4.  **API Key Integration**
    *   Update `createClientApiKey` to insert Tuples instead of JSON.
    *   Update `checkOAuthClientAccess` to use `PermissionService`.
    *   Update `verifyApiKey` to use `PermissionService`.

5.  **Migration & Cleanup**
    *   Write script to migrate `userClientAccess`, `groupClientAccess`, and `allowedResources` to Tuples.
    *   Verify data integrity.
    *   Drop legacy tables/columns.
