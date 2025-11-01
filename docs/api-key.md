# Authentication & Authorization Specification (Dedicated to API Key part)
## Overview  
This design supports two kinds of access flows:  
- **User-driven OAuth2/OIDC flows** (authorization code, ID token + access token) — for human users and client applications.  
- **Machine-to-machine (M2M) access via API keys** — for service-to-service or background processes.  
The system is built on Better Auth (Better Auth) and its plugins, with extensions for strict “which user can access which OAuth2 client” and “which client can issue which API keys” policies.

---

## Entities & Tables  
### OAuth2 Clients (Applications)  
- Table: `oauth_client` (or `oauth_application`)  
  - `client_id`, `client_secret`, `redirect_uris[]`, `name`, `metadata` (JSON)  
  - `allowedResources: Record<string, string[]>` (JSON) → defines resource types/actions (e.g., `{ "projects": ["read","write"], "logs": ["read"] }`)  
  - `allowsApiKeys: boolean` → whether the client may issue API keys  
  - `defaultApiKeyPermissions: Record<string, string[]>` → default permissions for API keys issued by this client

### User-to-Client Access Mapping  
- Table: `user_client_access`  
  ```sql
  CREATE TABLE user_client_access (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id     VARCHAR(255)   NOT NULL,
    client_id   VARCHAR(255)   NOT NULL,
    access_level VARCHAR(50)   NOT NULL,   -- e.g., "use", "admin"
    created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at  DATETIME       NULL,
    UNIQUE(user_id, client_id)
  );

* Default semantics: If no row exists for (user_id, client_id), treat as “allowed” (for backward compatibility) unless explicitly restricted.
* Later optionally change default to “deny unless row exists”.

### API Keys

* Managed by Better Auth’s API Key plugin (`api_key` table)

  * Fields: `id`, `user_id`, `prefix`, `key_hash`, `enabled`, `expires_at`, `remaining`, `refill_interval`, `rate_limit_time_window`, `rate_limit_max`, `metadata`, `permissions`.
  * Extend `metadata` to include: `oauth_client_id: string` → indicates which OAuth2 client the key belongs to.
  * `permissions`: resource/actions (e.g., `"projects": ["read"]`) consistent with client’s `allowedResources`.
  * Ownership: `user_id` refers to a “service account user” representing the OAuth2 client when issuing M2M keys.

---

## Flows & Enforcement

### User-Driven OAuth2 Flow

1. Client app initiates: redirect user to `/oauth2/authorize?client_id=...&redirect_uri=...`.
2. Auth server (Better Auth) displays login page.
3. After login, intercept before issuing authorization code:

   * Obtain `user_id` from session.
   * Obtain `client_id` from request.
   * Query `user_client_access`.

     * If entry exists and `access_level` includes “use” → proceed.
     * If no entry and client is in “default all-users allowed” mode → proceed.
     * Else → reject with `error=unauthorized_client_access`.
4. Issue authorization code, and token exchange yields access token & ID token.

   * Token may include claim: `client_access_level` or `client_id`.
5. Resource server validates token (`jwt` or introspection), checks `aud`, `scope`, `client_id`, and enforces resource access based on `scope`.
6. Optionally downstream service verifies `user_id` / `client_id` combination against `user_client_access`.

### Machine-to-Machine via API Keys

1. Admin creates API key for a given OAuth2 client:

   * Use service account user or owner user.
   * `createApiKey` call with `user_id`, `metadata.oauth_client_id = client_id`, `permissions` derived from client’s `allowedResources` or `defaultApiKeyPermissions`.
   * Set `expiresIn`, `rate_limit_time_window`, `remaining`, etc.
2. Service uses API key to call protected API: `x-api-key: <key>`.
3. Resource server extracts key, calls `verifyApiKey({ key, permissions: { … } })`.

   * If `valid === false` → reject 401/403.
   * If `valid === true`, ensure `metadata.oauth_client_id` matches expected client context and `permissions` cover required actions.
4. If check passes → proceed under “client context”.
5. User-driven token flows remain unchanged; API keys serve M2M only.

---

## Ownership & Context Semantics

* Map each OAuth2 client that issues API keys to a dedicated “service account user”.
* That service account user is only for key ownership (no interactive login).
* `oauth_client_id` in key metadata ensures context clarity.
* In user-driven flows, `user_id` = human user; API key flows, `user_id` = service account user.

---

## Default Access Behavior and User/Group-to-Client Assignment

### Default Client Access Behavior

* For newly-created OAuth2 clients *without explicit permissions or restrictions*, default policy = **all authenticated users may use this client**.
* Implementation: In `user_client_access`, missing row for (user_id, client_id) implies “allowed” under default mode.
* If restriction is later enabled for a client, enforcement begins based on explicit mapping.

### Selecting/Assigning Users or Groups to a Client

* Provide admin UI/API to **add/remove users or groups** to/from a client:

  * Use `user_client_access` table (and optionally a `group` table) for mapping.
  * Example schema above.
* On assignment: Admin selects user(s) and assigns `access_level`.
* Optionally support “groups”:

  * `client_user_group(group_id, name, …)`,
  * `group_membership(user_id, group_id)`,
  * `group_client_access(group_id, client_id, access_level)`.
* Enforcement:

  * At `/oauth2/authorize`, query row(s) in `user_client_access` (and group mappings) for user/client.
  * If row exists and access_level allows “use” → permit.
  * If no mapping and client in default mode → permit.
  * Otherwise → deny.

---

## Backward Compatibility & Default Policies

* Initial default: “All users allowed for all clients” unless explicit row denies/restricts.
* Legacy clients (without `allowedResources`) work unchanged.
* Gradually enable restrictions: mark clients with `allowedResources` or move default to “deny unless mapping exists”.
* Token issuance logic stays same; only additional user↔client check is layered in.

---

## UI new integration

### 1. **New Section: Access Control**

Add a new panel titled **Access Control** (below “Permissions & Scopes”):

* **Default Access Policy**

  * Dropdown or toggle:

    * `All Users` (default)
    * `Restricted`
* When `Restricted` is selected:

  * Display a **user/group selector**.

    * “Add User” button → opens modal with searchable list of users.
    * “Add Group” button → opens modal with predefined or dynamically created user groups.
  * Display assigned users/groups in a list:

    | Name     | Role  | Access Level | Actions  |
    | -------- | ----- | ------------ | -------- |
    | John Doe | User  | Use          | ❌ Remove |
    | Admins   | Group | Admin        | ✏️ Edit  |

---

### 2. **New Section: API Key Management**

Add a collapsible **API Keys** panel:

* **Enable API Keys for this Client**

  * Checkbox: when enabled, show fields:

    * Default API key permissions (multi-select of resource/action pairs)
    * Expiration policy (days or “never expire”)
    * Rate limit (optional)
* **Issued API Keys Table**

  | Key ID       | Owner (User/Service Account) | Created | Expires | Permissions   | Status | Actions   |
  | ------------ | ---------------------------- | ------- | ------- | ------------- | ------ | --------- |
  | `api_123...` | svc_payload_admin            | Oct 26  | —       | projects:read | Active | 🔑 Revoke |

---

### 3. **Enhance “Permissions & Scopes”**

Allow defining **application-specific permissions** (not just OIDC scopes):

* Add a “Custom Resource Permissions” section:

  * Key-value editor:

    | Resource   | Actions       |
    | ---------- | ------------- |
    | `projects` | `read, write` |
    | `logs`     | `read`        |
  * Used to prepopulate `allowedResources` for this OAuth2 client.
* These entries automatically appear as the basis for API key `permissions`.

--- 
### Notes:
* Default state (no permissions, default policy): all users can authorize.
* When admin toggles **Restricted Access**, a new access list UI appears.
* Authorization endpoint `/oauth2/authorize` checks access table.
* “API Keys” tab allows generating keys for machine-to-machine integrations under the selected client.

---

## Additional Considerations

* **Scopes vs Permissions**: Use consistent modelling resource → actions. Clients define `allowedResources`, tokens/API keys use `permissions`.
* **Audit & Logging**: Track user→client assignments, API key creation/revocation, unauthorized access attempts.
* **Revocation & Expiry**: Support `expires_at` in `user_client_access`, API key expiry and revocation.
* **Rate-limiting & Quotas**: Use plugin’s built-in `remaining`, `refill_interval`, `rate_limit_time_window`, `rate_limit_max`.
* **Token Claims**: For user-driven flows, include claim such as `client_access_level`.
* **Context Separation**: Keep human user flows (OAuth2) separate from client/machine flows (API key).
* **Middleware/Hooks Integration**: Use Better Auth hooks (e.g., `before`) or wrapper around `/oauth2/authorize` to enforce user↔client logic.
* **Documentation & Training**: Ensure engineering team understands dual flow (user & M2M), mapping logic, key ownership, enforcement.

---

## Summary Table

| Component                       | Purpose                              | Enforcement Point                        |
| ------------------------------- | ------------------------------------ | ---------------------------------------- |
| `oauth_client.allowedResources` | What the client is allowed to access | On key creation / token issuance         |
| `user_client_access` table      | Which user may use which client      | At `/oauth2/authorize` check             |
| `/oauth2/authorize` flow        | Human user authorising a client      | Middleware/hook validating user↔client   |
| API Key (via plugin)            | M2M credential scoped to a client    | `verifyApiKey` check in resource service |
| Resource server token/key check | Validate token/key and permissions   | At resource API endpoint                 |

---

## Key Points

* The old access token / ID token flows remain for client authentication and user-driven access.
* The API key flow is *in addition* for machine-to-machine (M2M) use.
* User-to-client access mapping ensures fine-grained control over which user can use which OAuth2 client.
* API keys are scoped to clients and leverage permissions derived from client definitions.
* Default behavior is permissive (all users allowed) unless a client is configured to restrict.
* Groups support may be added to simplify user-assignment to clients at scale.
