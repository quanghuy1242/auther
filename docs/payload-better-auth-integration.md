# Payload CMS + Better Auth Integration Plan

## Objective & Scope
- Replace Payload’s built-in local authentication with Better Auth acting as an OAuth2/OpenID Connect-compatible identity provider.
- Support a seamless admin login experience (SSO) and JWT-protected API access across serverless Next.js deployments.
- Provide an Auth0-style SPA login flow powered entirely by Better Auth (PKCE public client) for front-end applications.
- Keep Payload as the system of record for content permissions while Better Auth manages credentials, MFA, and social providers.

## High-Level Architecture
- **Better Auth Service (`auth-app`)**: Dedicated Next.js (App Router) project deployed to a serverless target (e.g., Vercel) running `better-auth` with the OIDC provider + JWT plugins. Stores user identities in a managed Postgres instance.
- **Payload CMS (`payload-app`)**: Next.js serverless deployment embedding Payload. Disables local auth, adds a custom auth strategy that validates Better Auth JWTs, and uses middleware to drive OAuth redirects.
- **Shared Concerns**:
  - JWKS endpoint exposed by Better Auth for JWT verification.
  - Shared secrets/env vars for webhook verification, admin API access, and cookie signing.
  - Observability (structured logs, tracing) routed to a central service (e.g., Sentry).

```
Browser ↔ Payload Admin (Next.js) ↔ Better Auth (Next.js) ↔ Postgres (auth DB)
           │                               │
           └────────── API clients ────────┘
```

## Better Auth Service Implementation (Main implementation of this project, others are for reference)
### 1. Project Bootstrap
- `pnpm create next-app@latest auth-app --typescript --app --tailwind --eslint`.
- Install dependencies: `better-auth`, chosen ORM (e.g., `drizzle-orm`), database driver, mailing provider SDK, `jose`.
- Configure TypeScript path aliases for shared utilities (token helpers, constants).

### 2. Data Layer
- Serverless Sqlite Turso. Create database schema via Drizzle migrations; Better Auth offers ready-made SQL migrations for its tables.
- Store secrets via platform environment manager (e.g., Vercel env, Doppler). Required vars:
  - `BETTER_AUTH_SECRET`, `BETTER_AUTH_DATABASE_URL`
  - `JWT_SIGNING_KEY` (if not using JWK rotation), `JWT_ISSUER`, `JWT_AUDIENCE`
  - Optional: social provider keys (Google, GitHub, etc.) and email provider credentials if you plan to offer those sign-in flows or transactional mail from Better Auth.

### 3. Better Auth Configuration
- Create `lib/auth.ts`:
  ```ts
  import { betterAuth } from "better-auth";
  import { jwt, oidcProvider, oAuthProxy } from "better-auth/plugins";

  export const auth = betterAuth({
    basePath: "/api/auth",
    database: { url: process.env.BETTER_AUTH_DATABASE_URL! },
    disabledPaths: ["/token"], // use /oauth2/token instead
    plugins: [
      jwt({
        issuer: process.env.JWT_ISSUER!,
        audience: [process.env.JWT_AUDIENCE!],
        jwks: { provider: "internal", rotateInterval: "1d" },
        disableSettingJwtHeader: true,
      }),
      oidcProvider({
        loginPage: "/sign-in",
        metadata: {
          issuer: process.env.JWT_ISSUER!,
        },
        clients: [
          {
            clientId: process.env.PAYLOAD_CLIENT_ID!,
            clientSecret: process.env.PAYLOAD_CLIENT_SECRET!,
            redirectUris: [process.env.PAYLOAD_REDIRECT_URI!],
            grantTypes: ["authorization_code"],
            tokenEndpointAuthMethod: "client_secret_basic",
          },
          {
            clientId: process.env.PAYLOAD_SPA_CLIENT_ID!,
            redirectUris: process.env.PAYLOAD_SPA_REDIRECT_URIS!.split(","),
            postLogoutRedirectUris: process.env.PAYLOAD_SPA_LOGOUT_URIS?.split(","),
            grantTypes: ["authorization_code"],
            tokenEndpointAuthMethod: "none",
            requirePkce: true,
          },
        ],
      }),
      oAuthProxy({
        productionURL: process.env.PRODUCTION_URL,
        currentURL: process.env.NEXT_PUBLIC_APP_URL,
      }),
    ],
  });
  ```
- Provide comma-delimited env vars for SPA redirect/logout URIs to avoid secret leakage in the browser (`PAYLOAD_SPA_REDIRECT_URIS`, `PAYLOAD_SPA_LOGOUT_URIS`). The SPA client omits a secret and enforces PKCE.
- Expose handler via `app/api/auth/[...betterAuth]/route.ts`.
- Implement the login UI at `/sign-in`, ensure OIDC endpoints (`/oauth2/authorize`, `/oauth2/token`, `/oauth2/userinfo`, `/oauth2/jwks`) are reachable, and wire up optional account-linking flows if required.
- Add webhook endpoints for login events to trigger audit logging or user provisioning if needed.

### 4. Admin & Management UI
- Build dashboard pages (protected by `getServerSession` equivalent) for user search, session revocation, and MFA enforcement.
- Provide developer documentation inside the repo (OpenAPI schema or typed SDK) for `authorize`, `token`, and `userinfo` endpoints that Payload will consume.

### 5. CI/CD & Operations
- Add lint/test workflows (ESLint, unit tests around token issuance, integration tests using Playwright).
- Configure `vercel.json` (or alternative) to mark `/api/auth/*` as edge or node runtimes depending on crypto requirements.
- Instrument with logging (Pino) and Sentry/Datadog for error tracking; emit auth events to analytics or audit trail storage.

## Payload CMS Integration
### 1. Payload Configuration Updates
- Install dependencies: `pnpm add jose cross-fetch`.
- Extend `payload.config.ts`:
  - Import custom auth strategy module.
  - Register `onInit` hook to attach Express middleware for guard/redirect in admin routes.
  - Expose Better Auth env vars through Payload’s server runtime (e.g., `process.env.BETTER_AUTH_JWKS_URL`).

### 2. Users Collection
- Add persistent link between Payload users and Better Auth identities:
  ```ts
  export const Users: CollectionConfig = {
    slug: "users",
    auth: {
      disableLocalStrategy: true,
      strategies: [betterAuthStrategy],
    },
    fields: [
      { name: "betterAuthUserId", type: "text", unique: true, index: true },
      { name: "displayName", type: "text" },
      { name: "roles", type: "select", hasMany: true, options: [...] },
    ],
  };
  ```
- Implement `betterAuthStrategy.authenticate`:
  1. Extract token from `Authorization` header or `betterAuthToken` cookie.
  2. Validate signature & claims using JWKS (`createRemoteJWKSet(new URL(process.env.BETTER_AUTH_JWKS_URL!))`) and enforce expiry/issuer/audience.
  3. For bearer access tokens, JWKS validation is sufficient; if you choose to accept other token types (e.g., opaque, refresh-session) call Better Auth’s introspection endpoint before trusting them.
  4. Upsert user document (sync metadata) and return `{ user: { collection: "users", ...doc } }`.

### 3. Middleware for Admin Redirect
- Inside `payloadConfig.onInit`, attach Express middleware executed before Payload admin route handling:
  - If `req.user` exists, continue.
  - Otherwise, build Better Auth authorize URL:
    ```
    const state = crypto.randomUUID();
    const { verifier, challenge } = await createPkcePair();
    storePkce(req, res, { state, verifier }); // encrypted cookie/session
    const authorizeURL = new URL(`${process.env.BETTER_AUTH_URL}/api/auth/oauth2/authorize`);
    authorizeURL.searchParams.set("client_id", process.env.PAYLOAD_CLIENT_ID!);
    authorizeURL.searchParams.set("redirect_uri", callbackUrl);
    authorizeURL.searchParams.set("response_type", "code");
    authorizeURL.searchParams.set("scope", "openid email profile");
    authorizeURL.searchParams.set("state", state);
    authorizeURL.searchParams.set("code_challenge", challenge);
    authorizeURL.searchParams.set("code_challenge_method", "S256");
    ```
  - Redirect unauthenticated users; for API calls return 401 with `WWW-Authenticate`.
- Expose the same logic through a first-party endpoint (`/api/auth/url`) so the admin login component and other SSR routes can fetch a ready-made authorize URL while the server persists the PKCE verifier.
- Provide `/auth/callback` route in Next.js layer:
  1. Receive `code`/`state`, verify CSRF `state`.
  2. Retrieve stored PKCE verifier, exchange code with Better Auth (`POST ${BETTER_AUTH_URL}/api/auth/oauth2/token`) supplying `code_verifier`, `client_id`, and the confidential `client_secret` if applicable.
  3. Set `betterAuthToken` (HTTP-only, `SameSite=Lax`) and redirect back to `/admin`.

### 4. Admin UI Overrides
- Override `admin` configuration:
  ```ts
  admin: {
    components: {
      routes: {
        Login: path.resolve(__dirname, "./components/BetterAuthLogin.tsx"),
      },
      afterNavLinks: [...],
    },
  }
  ```
- `BetterAuthLogin.tsx` should call a server endpoint (e.g., `/api/auth/url`) that prepares the PKCE state/cookies and returns the authorize URL, then perform the redirect. Provide a logout button that calls Better Auth’s logout endpoint (e.g., `/api/auth/oauth2/logout`) and clears the JWT cookie.

### 5. SPA Clients (Auth0 Replacement)
- Use the Better Auth OIDC client plugin on the SPA to orchestrate redirects:
  ```ts
  import { createAuthClient } from "better-auth/client";
  import { oidcClient } from "better-auth/client/plugins";

  export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    plugins: [
      oidcClient({
        clientId: process.env.NEXT_PUBLIC_PAYLOAD_SPA_CLIENT_ID!,
        redirectUri: `${window.location.origin}/auth/callback`,
        postLogoutRedirectUri: `${window.location.origin}/`,
        scope: "openid email profile",
      }),
    ],
  });
  ```
- During `authClient.oidc.signIn`, the plugin generates PKCE values, stores them in session storage, and redirects to Better Auth’s authorize endpoint. The SPA callback reads `code`/`state`, calls `authClient.oidc.handleCallback`, and receives ID/access tokens plus refresh tokens (if enabled).
- Persist tokens in memory or secure browser storage (e.g., `IndexedDB` via WebCrypto). Avoid HttpOnly cookies for SPA tokens to prevent CSRF.
- Provide `authClient.oidc.getAccessToken()` when issuing requests to Payload; attach as `Authorization: Bearer <token>` or leverage `fetch` interceptors.
- Implement silent renewal using an iframe or background `refresh_token` call prior to expiry; revoke tokens and clear storage on logout (`authClient.oidc.signOut`).
- For cross-tab sync, listen for `storage` events (token removal) or use BroadcastChannel to coordinate logout.

### 6. API Consumers
- Document expectation for clients to send `Authorization: Bearer <jwt>`.
- Implement helper `authenticateRequest` used in hooks/access control: call `payload.auth({ headers: req.headers })` to reuse strategy logic.

## Authentication Flow
### Admin / SSR (Confidential Client)
1. User navigates to `/admin`.
2. Middleware detects missing session → generates PKCE pair + state, stores them server-side, and redirects to Better Auth’s authorize endpoint with `client_id`, `redirect_uri`, `scope`, `state`, and `code_challenge`.
3. Better Auth renders `/sign-in`, collects credentials, and returns an authorization code to the callback.
4. Payload’s callback retrieves the stored `code_verifier`, posts to `/api/auth/oauth2/token` with the verifier + confidential client secret, and receives ID/access tokens.
5. Payload sets an HttpOnly `betterAuthToken` cookie (or session storage) and reloads `/admin`.
6. `betterAuthStrategy` validates inbound requests via JWKS, populates `req.user`, and authorization proceeds. Expired tokens trigger middleware to restart the flow.

### SPA / Public Client
1. SPA invokes `authClient.oidc.signIn`, which generates PKCE and stores it in session storage before redirecting to Better Auth’s authorize endpoint (no client secret).
2. After authentication, Better Auth redirects back to the SPA callback with `code` + `state`.
3. SPA calls `authClient.oidc.handleCallback`, exchanging the code at `/api/auth/oauth2/token` with the stored `code_verifier`. Tokens are stored client-side (memory or encrypted storage).
4. SPA adds `Authorization: Bearer <access_token>` to calls against Payload’s REST/GraphQL endpoints; `betterAuthStrategy` validates and hydrates `req.user`.
5. The SPA schedules silent refresh or uses the refresh token (if issued) to rotate credentials. Logout clears storage and optionally calls `/api/auth/oauth2/logout` to invalidate server-side sessions.

## Deployment Strategy
- **Environments**: dev (local docker Postgres), staging, production. Mirror env vars with secure managers.
- **Domain Model**:
  - Better Auth: `auth.example.com` (Next.js serverless).
  - Payload CMS: `cms.example.com`.
  - Configure CORS and cookie domains (`.example.com`) to share sessions across subdomains.
- **CI/CD**:
  - GitHub Actions pipeline with separate deploy jobs (`deploy-auth`, `deploy-payload`).
  - Run shared integration tests against staging before promotion.
  - Use feature flags to toggle SSO rollout (e.g., use local auth fallback in early stage).

## Testing & Validation
- **Unit**: Token validation helpers (mock JWKS), middleware behavior, user upsert logic.
- **Integration**: Playwright tests executing full login redirect flow against staging environments.
- **SPA**: Cypress/Playwright tests covering PKCE generation, callback handling, silent token refresh, and logout across tabs.
- **Security**: Perform JWT tampering tests, ensure CSRF `state` validation, check cookie flags (Secure, HttpOnly).
- **Load**: Simulate concurrent logins to size Postgres and confirm serverless cold-start impact.
- **Monitoring**: Use synthetic checks on `/admin` to ensure redirect + callback chain healthy.

## Security & Compliance Considerations
- Rotate JWKS daily; configure Payload to cache keys with TTL shorter than rotation window.
- Log authentication events with audit context (user id, ip, user agent) and forward to SIEM.
- Implement webhook from Better Auth to Payload to revoke sessions when user disabled.
- Enforce MFA via Better Auth policies; surface status in Payload admin banner if user missing MFA.
- Keep scopes minimal; tokens should contain only required claims (user id, email, roles ref).
- For SPA tokens, use proof of possession where possible (DPoP) or at least rotate refresh tokens frequently; encrypt at rest if stored in IndexedDB.
- Ensure GDPR-compliant data processing (DSAR, deletion) by syncing removal across both systems.

## Rollout & Migration Plan
1. **Phase 0**: Stand up Better Auth staging, run shadow logins (users log in twice) to validate identity data.
2. **Phase 1**: Enable SSO for internal admins; keep local auth fallback for emergency access.
3. **Phase 2**: Cut over SPA/front-end apps by swapping Auth0 SDK calls with the Better Auth OIDC client, migrating secrets and testing PKCE flows; issue new credentials for external API consumers.
4. **Phase 3**: Disable local auth, rotate admin passwords, archive legacy tokens.
5. **Rollback Strategy**: Maintain feature flag to re-enable Payload local auth; keep old login page for limited time, and document manual steps to invalidate Better Auth sessions if fallback engaged.

## Outstanding Decisions
- Choose ORM (Drizzle vs Prisma) and migration tooling for Better Auth DB.
- Decide between internal JWKS rotation vs external signing service (e.g., AWS KMS).
- Select email/MFA providers (Resend, Postmark, Twilio Verify) and align with compliance requirements.
- Determine if Payload should cache user metadata (roles, orgs) or fetch from Better Auth per request.
- Evaluate need for additional gateways (API Gateway/edge) if traffic must remain within VPC boundaries.
