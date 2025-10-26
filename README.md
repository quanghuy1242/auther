# Better Auth Service

Serverless Next.js project that runs a dedicated [better-auth](https://www.better-auth.com/) instance for Payload CMS and SPA clients. It exposes OAuth2/OIDC endpoints, issues JWTs backed by Turso (libSQL) via Drizzle ORM, and provides a sign-in experience for both confidential and PKCE clients.

## Features

- Email/password authentication with server actions + client form
- OIDC provider (`/api/auth/oauth2/*`) with JWKS at `/api/auth/jwks`
- JWT plugin (issuer/audience set via env, internal JWKS rotation)
- Two seeded OAuth clients
  - **Payload Admin** (confidential) – uses `client_secret_basic`
  - **Payload SPA** (public PKCE) – no secret, PKCE enforced
- Protected `/sign-up/email` and `/oauth2/register` endpoints (require `x-internal-signup-secret` header)
- Turso (libSQL) + Drizzle schema under `src/db`
- Utilities & scripts:
  - `pnpm auth:test` – full E2E smoke test (sign-in → authorize → token → userinfo → JWKS)
  - `pnpm clients:seed` – registers both OAuth clients via better-auth API
  - `pnpm user:create` – create credential users programmatically

## Quick Start

```bash
pnpm install
cp .env.example .env.local
pnpm clients:seed    # registers OAuth clients and prints client IDs/secrets
pnpm auth:test       # optional: verify auth flow end-to-end
pnpm dev
```

### Required Environment Variables

See `.env.example` for the full list. Minimum required for local development:

| Variable | Description |
|----------|-------------|
| `BETTER_AUTH_SECRET` | Random 32+ char secret (e.g., `openssl rand -base64 32`) |
| `BETTER_AUTH_DATABASE_URL` | Turso/libSQL connection string |
| `JWT_ISSUER` | Public URL of this service (e.g., `https://auth.example.com`) |
| `JWT_AUDIENCE` | Comma-separated audiences (Payload admin, SPA, etc.) |
| `PAYLOAD_CLIENT_ID` / `PAYLOAD_CLIENT_SECRET` | Confidential admin client credentials |
| `PAYLOAD_REDIRECT_URI` | Admin OAuth callback (`https://cms.example.com/auth/callback`) |
| `PAYLOAD_SPA_CLIENT_ID` | Public SPA client ID |
| `PAYLOAD_SPA_REDIRECT_URIS` | Comma-separated SPA callback URLs |

> After running `pnpm clients:seed`, paste the printed `client_id` and (for the admin client) `client_secret` into your `.env.local` and redeploy.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` / `pnpm start` | Production build & serve |
| `pnpm lint` | ESLint |
| `pnpm db:generate` / `pnpm db:push` | Drizzle schema generation & push|
| `pnpm clients:seed` | Register OAuth clients via `/api/auth/oauth2/register` |
| `pnpm auth:test` | Full auth smoke test |
| `pnpm user:create <email> <password> <name> <username> <displayUsername>` | Seed credential user |

## Payload CMS Integration

High-level steps (see `docs/payload-better-auth-integration.md` for the detailed plan):

1. Disable Payload local auth, register a custom strategy that validates Better Auth JWTs using `/api/auth/jwks`.
2. Add middleware in Payload to detect missing sessions, generate PKCE state, and redirect to `https://auth.../api/auth/oauth2/authorize`.
3. Implement `/auth/callback` in Payload to exchange codes at `/api/auth/oauth2/token`, store the `betterAuthToken` cookie, and redirect to `/admin`.
4. Replace the admin login page with a component that calls `/api/auth/url` (which prepares PKCE state + authorize URL) and performs the redirect.
5. SPA clients use the Better Auth OIDC client plugin with `PAYLOAD_SPA_CLIENT_ID` for PKCE-based flows.

## Testing Flow

`pnpm auth:test` exercises the entire stack:

1. GET `/sign-in`
2. POST `/api/auth/sign-in/email`
3. GET `/api/auth/oauth2/authorize`
4. POST `/api/auth/oauth2/token`
5. GET `/api/auth/oauth2/userinfo`
6. GET `/api/auth/jwks`

Successful output confirms the auth service is ready for Payload integration.
