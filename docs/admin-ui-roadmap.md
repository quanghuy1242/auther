# Better Auth Admin UI Roadmap

The current project ships only the public authentication flows (sign-in page, OIDC endpoints, JWKS rotation hook). All operator actions—creating users, registering OAuth clients, revoking sessions—must be executed through scripts or the database. This document captures a roadmap for a first-class management experience surfaced under `/admin`.

## Goals and Target Users
- **System administrators** manage tenants, troubleshoot sign-ins, and configure OAuth clients for downstream apps.
- **Support engineers** need visibility into user accounts, sessions, and tokens to resolve incidents.
- **Developers** occasionally register new client credentials for staging environments.

The UI should expose those capabilities without requiring CLI access.

## API & Data Inventory
Leverage the Better Auth endpoints that already exist in the server bundle:
- `GET /api/auth/get-session`, `GET /api/auth/list-sessions`, `POST /api/auth/revoke-session`, `POST /api/auth/revoke-sessions`
- `POST /api/auth/sign-up/email`, `POST /api/auth/change-email`, `POST /api/auth/change-password`
- `GET /api/auth/list-user-accounts`, `POST /api/auth/unlink-account`
- `GET /api/auth/oauth2/clients` (requires implementing a thin wrapper that queries the `oauth_application` table)
- `POST /api/auth/oauth2/register` (dynamic client registration)
- `POST /api/internal/rotate-jwks` (internal endpoint added in this repo) and Drizzle queries against the `jwks` table for visibility

Where no REST facade exists today (for example, listing OAuth clients or JWKS items), plan to add authenticated API routes that call Drizzle directly.

## Screen Map

### 1. Admin Shell (`/admin`)
- **Purpose**: Frame the management area with navigation, breadcrumbs, and global alerts.
- **UI elements**: Left navigation (Users, Sessions, OAuth Clients, Keys, Settings), top bar with current admin session, auto-refresh toggle.

### 2. Dashboard Overview
- **Data**: recent sign-ins, count of active sessions, number of OAuth clients, JWKS status (age of latest key).
- **Actions**: surface quick links to rotate keys, add user, register client.

### 3. Users

#### a. User List (`/admin/users`)
- **Table** columns: email, name, created date, verified status, linked providers.
- **Filters**: email substring, verified/unverified, provider (email/password vs OAuth).
- **Bulk actions**: verify email, disable user, delete (optional soft-delete).

#### b. User Detail (`/admin/users/:id`)
- **Tabs**:
  - **Profile**: core attributes, ability to edit name/email, trigger password reset.
  - **Linked Accounts**: providers from `listUserAccounts`, unlink button.
  - **Sessions**: active sessions with device info, revoke buttons.
  - **Activity**: audit trail (requires new log table if desired).
- **Actions**: impersonate (if allowed), resend verification email, force log-out everywhere.

#### c. Create/Invite User
- Modal or dedicated page powered by `sign-up/email` for email/password accounts plus optional role provisioning.
- Optional “send invite” flow that triggers the verification email without setting a password immediately.

### 4. Sessions (`/admin/sessions`)
- Global view of active sessions across users.
- Search by user email or IP address.
- Batch revocation.
- Timeline graph of session creations (requires aggregating `createdAt`).

### 5. OAuth Clients

#### a. Client List (`/admin/clients`)
- Show trusted clients baked into config and dynamically registered ones from the database.
- Columns: client name, type (confidential/public), redirect URIs (first 2 shown), last used timestamp.

#### b. Client Detail (`/admin/clients/:id`)
- **Metadata**: client ID, secret (masked with copy button), auth methods, grant types.
- **Redirect URIs**: editable list with add/remove.
- **Scopes and descriptions**.
- **Rotate secret** action for confidential clients.
- **Delete client** (with safeguards for production).

#### c. Register Client
- Form for dynamic registration (mirrors `/api/auth/oauth2/register` payload).
- Option to mark as trusted (writes to `oauth_application` with `disabled=false` and `skipConsent=true`).

### 6. Keys & Token Signing (`/admin/keys`)
- Display the entries from the `jwks` table: key ID, algorithm, creation time.
- Badge indicating whether the latest key breaches the 30-day rotation SLA.
- Button: “Rotate JWKS Now” that POSTs to `/api/internal/rotate-jwks`.
- Historical list of rotations and pruned keys (requires logging rotation job summaries).

### 7. Configuration & Secrets (`/admin/settings`)
- Read-only view of environment-derived configuration (issuer, base URL, rotation cadence).
- Controls to toggle features such as `allowDynamicClientRegistration` (backed by configuration values in a database table if you decide to store mutable settings).
- Section for “Internal API Secrets” showing whether `JWKS_ROTATION_SECRET` is set (never show the actual secret, just status).

### 8. Audit & Logs (Stretch)
- If you introduce an audit log table, expose filters for action type (user created, client rotated, session revoked).
- Provide CSV export to hand off to compliance teams.

## Access Control & Security
- Gate the entire `/admin` tree behind an “admin” role. Today, you can rely on a static allow list (`adminUserIds`) or install the Better Auth `admin` plugin and assign roles.
- Ensure every API route backing the UI revalidates the admin role server-side—never trust only the UI.
- Implement CSRF mitigation for state-changing operations by reusing Better Auth session tokens or cross-site headers.

## Implementation Notes
- **Routing**: use the existing Next.js `/admin` matcher in `src/proxy.ts`. Build the admin shell inside the app router with nested layouts.
- **Data fetching**: prefer React Server Components backed by fetch wrappers around `/api/auth/*`, but fall back to client components with SWR/React Query for live updates (sessions table).
- **Design system**: adopt a minimal Tailwind + radix UI stack to match the existing sign-in form’s aesthetic.
- **Extensibility**: keep server actions and API routes separate so they can be reused by future CLI tooling, tests, or automation.

## Success Criteria
- Admins can provision and disable users without leaving the browser.
- OAuth client secrets and redirect URLs can be managed through the UI.
- Session and JWKS status are visible at a glance, with ability to remediate (revoke/rotate).
- Each screen documents which backend endpoints it depends on, ensuring the API surface stays intentionally scoped.

This document should be updated as new administrative features land so engineering has a shared map of the required UI surface.
