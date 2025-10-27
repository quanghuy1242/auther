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
  - JWKS endpoint exposed by Better Auth for ID token verification.
    - Production path: `https://<auth-domain>/api/auth/jwks`.
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
  import { drizzleAdapter } from "better-auth/adapters/drizzle";
  import { jwt } from "better-auth/plugins/jwt";
  import { oidcProvider } from "better-auth/plugins/oidc-provider";
  import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
  import { username } from "better-auth/plugins";
  import { nextCookies } from "better-auth/next-js";

  export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.PRODUCTION_URL ?? process.env.NEXT_PUBLIC_APP_URL,
    basePath: "/api/auth",
    disabledPaths: ["/token"], // OAuth 2.0 clients must call /api/auth/oauth2/token
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    hooks: {
      // Protect internal sign-up + dynamic registration endpoints
      before: createAuthMiddleware(async (ctx) => {
        const request = ctx.request;
        if (!request) return;

        const basePath = new URL(ctx.context.baseURL).pathname;
        const relativePath = request.url.replace(
          new RegExp(`^https?://[^/]+${basePath}`),
          "/",
        );

        if (["/sign-up/email", "/oauth2/register"].includes(relativePath)) {
          const headerSecret = request.headers.get("x-internal-signup-secret");
          if (headerSecret !== process.env.PAYLOAD_CLIENT_SECRET) {
            throw new Response("Forbidden", { status: 403 });
          }
        }
      }),
    },
    plugins: [
      username(),
      jwt({
        jwt: {
          issuer: process.env.JWT_ISSUER!,
          audience: process.env.JWT_AUDIENCE!.split(","),
        },
        disableSettingJwtHeader: true,
      }),
      oidcProvider({
        loginPage: "/sign-in",
        allowDynamicClientRegistration: true,
        metadata: {
          issuer: process.env.JWT_ISSUER!,
        },
        trustedClients: [
          {
            clientId: process.env.PAYLOAD_CLIENT_ID!,
            clientSecret: process.env.PAYLOAD_CLIENT_SECRET!,
            type: "web",
            name: "Payload Admin (Confidential)",
            redirectURLs: [process.env.PAYLOAD_REDIRECT_URI!],
            metadata: {
              tokenEndpointAuthMethod: "client_secret_basic",
              grantTypes: ["authorization_code"],
            },
            skipConsent: true,
          },
          {
            clientId: process.env.PAYLOAD_SPA_CLIENT_ID!,
            type: "public",
            name: "Payload SPA (PKCE)",
            redirectURLs: process.env.PAYLOAD_SPA_REDIRECT_URIS!.split(","),
            metadata: {
              tokenEndpointAuthMethod: "none",
              grantTypes: ["authorization_code"],
              postLogoutRedirectUris:
                process.env.PAYLOAD_SPA_LOGOUT_URIS?.split(",") ?? [],
            },
            skipConsent: true,
          },
        ],
      }),
      oAuthProxy({
        productionURL: process.env.PRODUCTION_URL,
        currentURL: process.env.NEXT_PUBLIC_APP_URL,
      }),
      nextCookies(),
    ],
  });
  ```
- Provide comma-delimited env vars for SPA redirect/logout URIs to avoid secret leakage in the browser (`PAYLOAD_SPA_REDIRECT_URIS`, `PAYLOAD_SPA_LOGOUT_URIS`). The SPA client omits a secret and enforces PKCE.
- Two client applications are required:
  - **Payload Admin (confidential client)** — server-side OAuth exchange for the Next.js/Payload admin UI. Requires `PAYLOAD_CLIENT_ID`, `PAYLOAD_CLIENT_SECRET`, and `PAYLOAD_REDIRECT_URI`. Uses `client_secret_basic` at the token endpoint.
  - **Payload SPA (public PKCE client)** — browser-based PKCE flow for front-end apps. Requires `PAYLOAD_SPA_CLIENT_ID` and `PAYLOAD_SPA_REDIRECT_URIS`. No secret is issued; PKCE verifier is required.
- Use the seeding helper to register clients via Better Auth’s official API once the service is deployed:
  ```bash
  pnpm clients:seed
  ```
  Copy the printed `client_id`/`client_secret` values into `.env.local` (and Vercel) so the trusted client configuration matches runtime credentials.
- Expose handler via `app/api/auth/[...betterAuth]/route.ts`.
- Implement the login UI at `/sign-in`, ensure OIDC endpoints (`/oauth2/authorize`, `/oauth2/token`, `/oauth2/userinfo`, `/jwks`) are reachable, and wire up optional account-linking flows if required.
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
  1. Extract the ID token from the `Authorization` header or `betterAuthIdToken` cookie.
  2. Validate signature & claims using JWKS (`createRemoteJWKSet(new URL(process.env.BETTER_AUTH_JWKS_URL!))`) and enforce expiry/issuer/audience.
  3. If your middleware also needs resource data (profile, email, etc.), call Better Auth’s `/api/auth/oauth2/userinfo` endpoint with the accompanying opaque access token; do not try to locally verify the access token.
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
  ```ts
  // payload-app/src/app/api/auth/url/route.ts
  import { cookies } from "next/headers";
  import { NextResponse } from "next/server";
  import { createPkcePair } from "@/lib/pkce";

  export async function GET() {
    const state = crypto.randomUUID();
    const { verifier, challenge } = await createPkcePair();
    cookies().set("betterAuthState", JSON.stringify({ state, verifier }), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    const authorizeURL = new URL(
      `${process.env.BETTER_AUTH_URL!}/api/auth/oauth2/authorize`,
    );
    authorizeURL.searchParams.set("client_id", process.env.PAYLOAD_CLIENT_ID!);
    authorizeURL.searchParams.set("redirect_uri", process.env.PAYLOAD_REDIRECT_URI!);
    authorizeURL.searchParams.set("response_type", "code");
    authorizeURL.searchParams.set("scope", "openid email profile");
    authorizeURL.searchParams.set("state", state);
    authorizeURL.searchParams.set("code_challenge", challenge);
    authorizeURL.searchParams.set("code_challenge_method", "S256");

    return NextResponse.json({ authorizeURL: authorizeURL.toString() });
  }
  ```
- Provide `/auth/callback` route in Next.js layer:
  1. Receive `code`/`state`, verify CSRF `state`.
  2. Retrieve stored PKCE verifier, exchange code with Better Auth (`POST ${BETTER_AUTH_URL}/api/auth/oauth2/token`) supplying:
     - `grant_type=authorization_code`
     - `client_id`
     - `client_secret` (confidential client only)
     - `code_verifier`
  3. Set `betterAuthIdToken` (HTTP-only, `SameSite=Lax`) with `Set-Cookie` and redirect back to `/admin`.
     ```ts
     // payload-app/src/app/auth/callback/route.ts
     const tokenRes = await fetch(
       `${process.env.BETTER_AUTH_URL}/api/auth/oauth2/token`,
       {
         method: "POST",
         headers: {
           "Content-Type": "application/x-www-form-urlencoded",
           Authorization: `Basic ${Buffer.from(
             `${process.env.PAYLOAD_CLIENT_ID}:${process.env.PAYLOAD_CLIENT_SECRET}`,
           ).toString("base64")}`,
         },
         body: new URLSearchParams({
           grant_type: "authorization_code",
           code,
           redirect_uri: process.env.PAYLOAD_REDIRECT_URI!,
           code_verifier,
         }),
       },
     );
     const { access_token, id_token } = await tokenRes.json();
     cookies().set("betterAuthIdToken", id_token, {
       httpOnly: true,
       sameSite: "lax",
       secure: true,
       path: "/",
     });
     ```

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
- During `authClient.oidc.signIn`, the plugin generates PKCE values, stores them in session storage, and redirects to Better Auth’s authorize endpoint. The SPA callback reads `code`/`state`, calls `authClient.oidc.handleCallback`, and receives an ID token, an opaque access token (for calling Better Auth APIs), plus refresh tokens (if enabled).
- Persist tokens in memory or secure browser storage (e.g., `IndexedDB` via WebCrypto). Avoid HttpOnly cookies for SPA tokens to prevent CSRF.
- Provide the ID token to Payload requests (e.g., `Authorization: Bearer ${idToken}`) so the CMS can validate it via JWKS. Use the opaque access token only when calling Better Auth endpoints such as `/userinfo`.
- Implement silent renewal using an iframe or background `refresh_token` call prior to expiry; revoke tokens and clear storage on logout (`authClient.oidc.signOut`).
- For cross-tab sync, listen for `storage` events (token removal) or use BroadcastChannel to coordinate logout.

### 6. API Consumers
- Document expectation for clients to send `Authorization: Bearer <id_token>` (opaque access tokens are only valid against Better Auth’s own endpoints).
- Implement helper `authenticateRequest` used in hooks/access control: call `payload.auth({ headers: req.headers })` to reuse strategy logic.

## Authentication Flow
### Admin / SSR (Confidential Client)
1. User navigates to `/admin`.
2. Middleware detects missing session → calls `/api/auth/url` server-side to generate PKCE `state` + `verifier`. The endpoint stores the verifier in an HttpOnly cookie and returns the Better Auth authorize URL.
3. Payload redirects the browser to the returned URL (`https://auth.../api/auth/oauth2/authorize?client_id=...&code_challenge=...`).
4. Better Auth renders `/sign-in`, collects credentials, sets its session cookie, and redirects to the configured admin `redirect_uri` with an authorization code.
5. Payload’s `/auth/callback` route reads the stored `state`/`verifier`, verifies CSRF, and posts to `/api/auth/oauth2/token` (confidential client secret + PKCE `code_verifier`) to obtain tokens.
6. Payload stores the ID token securely (e.g., HttpOnly `betterAuthIdToken` cookie scoped to the admin domain) and redirects back to `/admin`. Store the opaque access token separately only if you plan to call Better Auth’s userinfo endpoint server-side.
7. `betterAuthStrategy` validates the ID token against `https://auth.<domain>/api/auth/jwks`. Expired tokens trigger middleware to restart the flow at step 2.

### SPA / Public Client
1. The SPA uses `authClient.oidc.signIn()` (PKCE flow). The plugin generates/verifies state in session storage and builds the authorize URL.
2. Browser redirects to `https://auth.../api/auth/oauth2/authorize?client_id=<PAYLOAD_SPA_CLIENT_ID>&code_challenge=...` (no secret required).
3. After authentication, Better Auth redirects back to the SPA callback with `code` + `state`. The SPA calls `authClient.oidc.handleCallback()` which POSTs to `/api/auth/oauth2/token` with the stored PKCE `code_verifier`. Returned tokens stay client-side (memory, secure storage, etc.).
4. API calls to Payload include `Authorization: Bearer <access_token>`; the Payload strategy validates the token via JWKS.
5. Silent refresh (via refresh_token) or re-run `signIn()` before expiration. Logout clears SPA storage and optionally calls Better Auth’s logout endpoint.

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
