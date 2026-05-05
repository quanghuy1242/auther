# Auther — Identity Provider & Authorization Control Plane

A serverless Next.js service providing OAuth2/OIDC authentication, JWT issuance, ReBAC+ABAC authorization, a Lua pipeline engine, webhook delivery, and a full admin UI. Built with **Better Auth**, **Drizzle ORM**, and a **Turso/libSQL** backend.

---

## Architecture

```
                         ┌──────────────────────┐
                         │       Auther          │
                         │   (IdP + AuthZ plane) │
                         └──────────┬───────────┘
                                    │
          ┌─────────────────────────┼──────────────────────────┐
          │                         │                          │
   ┌──────▼──────┐          ┌──────▼──────┐          ┌───────▼───────┐
   │  payloadcms  │          │  next-blog   │          │  future app   │
   │  (OAuth      │          │  (OAuth      │          │  (OAuth       │
   │   client)    │          │   client)    │          │   client)     │
   └──────┬───────┘          └──────────────┘          └───────────────┘
          │
   ┌──────▼──────┐
   │  Resource    │
   │  Server      │
   │  (payload-   │
   │   content-api│
   └──────────────┘
```

### Core Concepts

| Concept | Role | Live instance |
|---------|------|---------------|
| **Identity Provider** | Authenticates users, manages sessions, issues tokens | Auther itself |
| **OAuth Client** | Application requesting tokens via OAuth2/OIDC | payload admin, next-blog |
| **Resource Server** | API consuming access tokens with audience binding | `payload-content-api` |
| **Authorization Space** | Scope owning models, grants, and permission tuples | `payload-content` |
| **Projection** | Read model subscribing to space events | Payload `GrantMirror` |

Clients authenticate users and request access into spaces. Spaces own the permission model — clients do **not** own authorization.

---

## 1. OAuth2 / OIDC Identity Provider

Built on Better Auth's `oidcProvider` plugin with JWKS-signing JWT plugin.

**Endpoints exposed:**

| Path | Method | Purpose |
|------|--------|---------|
| `/api/auth/oauth2/authorize` | GET | Authorization endpoint (PKCE S256, confidential + public clients) |
| `/api/auth/oauth2/token` | POST | Token exchange (authorization code → access + id tokens) |
| `/api/auth/oauth2/userinfo` | GET | UserInfo endpoint (Bearer-authenticated) |
| `/api/auth/jwks` | GET | JWKS endpoint for token verification |
| `/api/auth/oauth2/register` | POST | Dynamic client registration |
| `/api/auth/sign-in` | POST | Email/password sign-in (OAuth2-only: `disabledPaths: ["/token"]`) |
| `/api/auth/sign-up` | POST | Email/password sign-up with verification |

**Key design decisions:**
- No email/password token endpoint (`/token` disabled) — all resource access goes through OAuth2 token exchange
- OAuth clients managed via DB (`oauth_application` table) + admin UI, not hardcoded `trustedClients`
- Resource access tokens minted with explicit audience (`payload-content-api`) via JWKS-signed JWT
- Consent auto-recorded for trusted first-party clients before Better Auth validates the authorize request

**Source:** `src/lib/auth.ts`, `src/app/api/auth/[...betterAuth]/route.ts`

---

## 2. ReBAC + ABAC Authorization Engine

A multi-stage permission evaluation system combining Relationship-Based Access Control with Lua Attribute-Based policy evaluation.

### ReBAC (Relationship-Based)

The core `PermissionService` (`src/lib/auth/permission-service.ts`) implements Zanzibar-style graph traversal:

1. **Global admin bypass** — `role === "admin"` always passes
2. **Client-wide full_access** — full access on `oauth_client` grants all entities
3. **Authorization space full_access** — space-level full access
4. **Model resolution** — looks up authorization model for the entity type
5. **Subject expansion** — BFS traversal of user → groups → parent groups with hierarchy relations
6. **Relation transitivity** — `owner` implies `editor` implies `viewer`
7. **Tuple matching** — direct + wildcard (`entityId = "*"`) matching
8. **ABAC policy evaluation** — Lua policies evaluated on conditioned tuples

**Endpoints:**

| Path | Purpose |
|------|---------|
| `POST /api/auth/check-permission` | Single permission check (API key or Bearer) |
| `POST /api/auth/check-permission/batch` | Batch permission check for multiple entity IDs |
| `GET /api/auth/list-objects` | List entity IDs a user can access (Zanzibar list-objects) |

**9 built-in entity types** with relation hierarchies: `platform`, `users`, `groups`, `clients`, `webhooks`, `pipelines`, `api_keys`, `keys`, `sessions`. Each has typed guard functions (50+ guards in `src/lib/auth/platform-guard.ts`).

### ABAC (Lua Policy Engine)

Context-aware conditional policies written in Lua, executed in a pooled Wasmoon (WebAssembly Lua 5.3) engine. Policies receive `context.resource`, `context.user`, `context.action`, `context.timestamp`, `context.request`. All evaluations are audited (`abacAuditLogs` table). Policy versions are tracked (`policyVersions`).

**Source:** `src/lib/auth/policy-engine.ts`, `src/lib/auth/abac-context.ts`, `src/lib/auth/lua-validator.ts`, `src/db/rebac-schema.ts`, `src/db/abac-schema.ts`

---

## 3. Pipeline System — Lua Scripts at Auth Lifecycle Hooks

A DAG-based Lua script execution engine with a visual editor, integrated into 16 auth lifecycle hooks.

### 16 Pipeline Hooks

| Group | Hooks |
|-------|-------|
| **Authentication** (6) | `before_signup`, `after_signup`, `before_signin`, `after_signin`, `before_signout`, `token_build` |
| **API Key** (5) | `apikey_before_create`, `apikey_after_create`, `apikey_before_exchange`, `apikey_after_exchange`, `apikey_before_revoke` |
| **OAuth Client** (5) | `client_before_register`, `client_after_register`, `client_before_authorize`, `client_after_authorize`, `client_access_change` |

### Execution Engine

- **DAG-based**: Scripts are arranged in layers; scripts within a layer run in parallel
- **Sandboxed**: Wasmoon Lua engine pool (max 20 engines, 5-min TTL), 10s timeout, 5KB size limit, 50k instruction limit, HTTPS-only safe `fetch()`, SSRF protection
- **Tracing**: OpenTelemetry-compatible traces + spans, custom `helpers.trace()` in scripts
- **Secrets**: AES-256-GCM encrypted secrets per script (`pipelineSecrets` table)

### Swimlane Visual Editor

Available at `/admin/pipelines/editor`. Built with `@xyflow/react` (React Flow) for DAG layout, CodeMirror 6 for Lua editing with LSP-style autocomplete, linting, diagnostics, signature help, and inlay hints. Uses `shiki` for syntax highlighting and `luaparse` for validation.

**Source:** `src/lib/auth/pipeline-engine.ts`, `src/lib/auth/lua-engine-pool.ts`, `src/lib/pipelines/`, `src/app/admin/pipelines/editor/page.tsx`, `src/db/pipeline-schema.ts`

---

## 4. Webhook System

Multi-endpoint webhook delivery with 20 event types, QStash-queued retries, and HMAC-SHA256 signed payloads.

### Event Types (20)

| Category | Events |
|----------|--------|
| User | `user.created`, `user.updated`, `user.deleted`, `user.verified` |
| Session | `session.created`, `session.deleted` |
| Account | `account.linked`, `account.unlinked` |
| Verification | `verification.sent`, `verification.completed` |
| OAuth Client | `client.created`, `client.updated`, `client.deleted` |
| Access | `access.granted`, `access.revoked` |
| Grants (ReBAC) | `grant.created`, `grant.revoked`, `grant.condition.updated` |
| Groups | `group.member.added`, `group.member.removed` |

### Delivery Flow

1. Auth hook fires → `emitWebhookEvent()` creates event record + pending deliveries
2. Subscribers matched by event type + userId + optional clientId
3. Jobs enqueued via **QStash** (Upstash) with endpoint retry policy
4. Queue worker (`/api/internal/queues/webhook-delivery`) builds HMAC-SHA256 signed payload with 5-min anti-replay window
5. Delivers via HTTP POST/PUT (JSON or form-encoded), records status/duration

### Inbound Webhooks

`POST /api/webhooks/payload` receives `user.updated` and `user.deleted` events from Payload CMS.

**Source:** `src/lib/webhooks/`, `src/app/api/internal/queues/webhook-delivery/route.ts`, `src/db/app-schema.ts`

---

## 5. API Key System

API keys are first-class authorization subjects with client scoping and JWT exchange.

- **Creation**: Per authorization-space or per-client, with metadata for scoping
- **Exchange:** `POST /api/auth/api-key/exchange` — exchanges a valid API key for a short-lived (15-min) JWKS-signed JWT with ReBAC-resolved permissions and ABAC metadata
- **Permission check:** API keys go through the same `PermissionService` resolver as users and groups — no separate code path

**Source:** `src/app/api/auth/api-key/exchange/route.ts`, `src/lib/auth/client-api-key-auth.ts`, `src/lib/auth/space-api-key-auth.ts`

---

## 6. Registration Contexts & Invite System

Sign-up flows with automatic permission grants.

- **Platform contexts** — grant platform-wide permissions on sign-up (origin-restricted or invite-only)
- **Client contexts** — grant client-specific permissions on first OAuth authorization
- **Signed invites** — HMAC-signed tokens with 7-day expiry, optional email lock, one-time use
- **Grant application** — idempotent grant creation via hook integration on `user.create.after`

**Source:** `src/lib/services/registration-context-service.ts`, `src/lib/pipelines/registration-grants.ts`, `src/db/platform-access-schema.ts`

---

## 7. Admin UI

25+ pages with platform-guarded access controls.

| Section | Pages |
|---------|-------|
| Dashboard | Metrics overview with SSE streaming |
| Users | List, detail (profile/security/sessions/accounts/permissions/groups), invites |
| OAuth Clients | List, detail, register, access management, space management |
| Authorization Spaces | List, detail, access (API keys + scoped permissions + models) |
| Resource Servers | List, detail |
| Webhooks | List, detail (endpoints/subscriptions/deliveries) |
| Pipelines | Dashboard, swimlane editor, traces, secrets |
| Groups | List, manage |
| Keys | JWKS signing key management |
| Sessions | View and manage |
| Requests | Permission escalation workflow |
| Settings | Application configuration |

**Source:** `src/app/admin/`

---

## 8. Resource Access Token Bridge

When a client linked to the `payload-content` authorization space successfully exchanges an authorization code at `/api/auth/oauth2/token`, the response is transparently wrapped: the opaque access token is replaced with a **JWKS-signed JWT** bearing:

- `aud = payload-content-api` (from the resource server)
- `sub = Auther user ID`
- `token_use = access`
- Client ID and authorization space metadata

PayloadCMS validates this token against the configured audience and JWKS endpoint.

**Source:** `src/lib/auth/resource-access-token.ts`, `src/lib/repositories/resource-access-token-repository.ts`

---

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev              # http://localhost:3000
```

### Docker Compose (full local stack)

7 services: LibSQL server, Redis, QStash, Mailhog, Webhook tester, app, and auto-seeding.

```bash
pnpm d:up-dev         # dev mode with hot reload
pnpm d:up             # production mode
```

### Key Environment Variables

<details>
<summary>Expand full env reference</summary>

```bash
# Core
BETTER_AUTH_SECRET=                    # 32+ char session encryption secret
BETTER_AUTH_DATABASE_URL=              # libsql://your-db.turso.io
BETTER_AUTH_DATABASE_AUTH_TOKEN=       # Turso auth token
PRODUCTION_URL=                        # https://auth.yourdomain.com

# JWT
JWT_ISSUER=                            # https://auth.yourdomain.com
JWT_AUDIENCE=                          # comma-separated audience values

# Signup guard
INTERNAL_SIGNUP_SECRET=                # protects internal signup route

# OAuth clients (for seed scripts)
PAYLOAD_CLIENT_ID=                     # payload admin OAuth client ID
PAYLOAD_CLIENT_SECRET=                 # payload admin client secret
PAYLOAD_REDIRECT_URI=                  # payload admin callback URL
PAYLOAD_SPA_CLIENT_ID=                 # payload SPA client ID (PKCE)
PAYLOAD_SPA_REDIRECT_URIS=            # SPA redirect URIs (comma-separated)
BLOG_CLIENT_ID=                        # next-blog OAuth client ID (PKCE)
BLOG_REDIRECT_URI=                     # blog callback URL

# Resource token bridge
PAYLOAD_RESOURCE_TOKEN_SPACE_SLUG=     # default: payload-content
PAYLOAD_RESOURCE_TOKEN_RESOURCE_SERVER_SLUG= # default: payload-content-api

# Origins
AUTH_TRUSTED_ORIGINS=                  # comma-separated origin list
PAYLOAD_PREVIEW_ORIGIN_PATTERNS=       # e.g., https://*.vercel.app

# Cron
CRON_SECRET=                           # protects cron endpoints

# Queue (Upstash)
UPSTASH_REDIS_REST_URL=                # Redis REST URL
UPSTASH_REDIS_REST_TOKEN=              # Redis auth token
QSTASH_TOKEN=                          # QStash auth token
QSTASH_CURRENT_SIGNING_KEY=            # QStash signing key
QSTASH_NEXT_SIGNING_KEY=               # QStash next signing key (rotation)
QUEUE_TARGET_BASE_URL=                 # base URL for queue callbacks

# Webhooks
PAYLOAD_WEBHOOK_URL=                   # payload webhook target
PAYLOAD_OUTBOUND_WEBHOOK_SECRET=       # outgoing webhook HMAC secret
PAYLOAD_INBOUND_WEBHOOK_SECRET=        # inbound webhook verification secret

# Email (Resend)
RESEND_API_KEY=                        # Resend API key
EMAIL_FROM=                            # sender address
EMAIL_FROM_NAME=                       # sender display name
SKIP_EMAIL_SENDING=                    # set true in dev
```
</details>

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint + TypeScript check |
| `pnpm user:create` | Create a user via CLI |
| `pnpm clients:seed` | Seed OAuth clients from env vars |
| `pnpm auth:r2:seed-payload-space` | Seed the Payload authorization space topology |
| `pnpm auth:test` | Test full auth flow |
| `pnpm d:up` | Docker Compose (production) |
| `pnpm d:up-dev` | Docker Compose (dev + hot reload) |
| `pnpm d:down` | Stop Docker services |

## File Map

```
src/
├── lib/
│   ├── auth.ts                    # Better Auth core config + plugins
│   ├── auth/
│   │   ├── permission-service.ts  # ReBAC permission resolver
│   │   ├── policy-engine.ts       # ABAC Lua policy engine
│   │   ├── pipeline-engine.ts     # DAG Lua script executor
│   │   ├── lua-engine-pool.ts     # Wasmoon engine pool
│   │   ├── platform-guard.ts      # 50+ typed permission guards
│   │   ├── resource-access-token.ts # Resource token minting
│   │   └── jwt-signing-key.ts     # JWKS private key loader
│   ├── pipelines/                 # Pipeline hook definitions + integrator
│   ├── webhooks/                  # Webhook delivery + event emitters
│   ├── services/                  # Registration contexts, metrics, etc.
│   ├── repositories/              # 15+ data access repositories
│   └── utils/                     # CORS, wildcard matching, OAuth helpers
├── app/
│   ├── api/                       # All API route handlers
│   │   ├── auth/                  # Public auth endpoints
│   │   └── internal/              # Cron + queue + internal APIs
│   └── admin/                     # Admin UI (25+ pages)
├── db/                            # Drizzle schema (7 schema files)
│   ├── auth-schema.ts             # Auth tables (user, session, OAuth)
│   ├── app-schema.ts              # App tables (spaces, servers, webhooks)
│   ├── rebac-schema.ts            # ReBAC tables (tuples, models)
│   ├── abac-schema.ts             # ABAC audit tables (logs, versions)
│   ├── pipeline-schema.ts         # Pipeline tables (scripts, graphs, traces)
│   ├── platform-access-schema.ts  # Registration + permission requests
│   └── metrics-schema.ts          # Metrics storage
├── env.ts                         # Zod-validated env vars
└── schemas/                       # Zod schemas for forms + API validation
scripts/                           # Seed, test, and utility scripts
docs/                              # 40+ architecture and implementation docs
tests/                             # Integration tests
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, React 19, TypeScript 5) |
| Auth | Better Auth 1.3 (OIDC, JWT, API keys, username, admin plugins) |
| Database | SQLite via Turso/libSQL + Drizzle ORM |
| Lua Engine | Wasmoon (WebAssembly Lua 5.3) with connection pooling |
| Queue | QStash (Upstash) with signature verification |
| Cache | Upstash Redis |
| Email | Resend API + React Email templates |
| UI | Tailwind CSS 4, Radix UI, Recharts, React Flow |
| Editor | CodeMirror 6, Shiki syntax highlighting, luaparse |
| JWT/Crypto | Jose, Node.js crypto |
| Deployment | Next.js (Vercel), Docker Compose for local dev |
