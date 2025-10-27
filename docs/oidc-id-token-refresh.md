# OIDC ID Token Rotation Flow with Better Auth

This project issues OpenID Connect (`id_token`) credentials through the Better Auth OIDC provider. You can keep relying on ID tokens for downstream apps provided you understand which protocol paths mint new tokens and which ones do not.

## Current Configuration
- `src/lib/auth.ts:87` registers the `oidcProvider` plugin with `useJWTPlugin: true`, so ID tokens are signed with the same asymmetric key material exposed at `/api/auth/jwks`.
- Trusted clients (`src/lib/auth.ts:94`, `src/lib/auth.ts:108`) request the `authorization_code` grant and the `openid` scope. The token endpoint issues an ID token when exchanging the authorization code (`node_modules/better-auth/dist/shared/better-auth.DNkpxiLq.mjs:1110`).
- Refresh tokens are supported once the client also asks for the `offline_access` scope and declares `refresh_token` in its grant list. The refresh flow is handled in the `grant_type=refresh_token` branch (`node_modules/better-auth/dist/shared/better-auth.DNkpxiLq.mjs:820-882`).

## Important Detail: Refresh Tokens Do Not Mint a New ID Token
Better Auth follows the OAuth 2.0 token response shape for refresh grants and only returns:
- `access_token`
- `refresh_token`
- `expires_in`
- `token_type`
- `scope`

It does **not** include a new `id_token` when `grant_type=refresh_token`. The OpenID Connect Core spec makes the ID token optional in that response, so this behaviour is compliant but easy to miss if you depend solely on ID tokens.

Because of this, any consumer that validates requests exclusively with an ID token must acquire a new authorization code whenever the current ID token expires.

## Recommended Renewal Pattern for ID Tokens
1. **Initial authorization**
   - Request `scope=openid profile email offline_access`.
   - The `/oauth2/token` exchange yields `id_token`, `access_token`, and (because of `offline_access`) a `refresh_token`.
2. **Before the ID token expires**
   - Trigger a silent authorization to mint a fresh code. Use `prompt=none` and the existing session cookie (or run the flow inside a hidden iframe) so the user is not interrupted.
   - Exchange the new code at `/api/auth/oauth2/token` again. This response contains a new `id_token`, a new `access_token`, and a rotated `refresh_token`.
3. **Use the refresh token only for non-ID-token callers**
   - If you also have clients that rely on `access_token` (e.g. they call `userinfo`), the refresh grant keeps their session alive without user interaction.

### Why not reuse the old ID token?
- ID tokens contain a short `exp` claim; once expired, relying parties must reject them.
- `/oauth2/token` does not supply a replacement ID token on refresh, so continuing to send the old one will fail verification.
- Silent re-authorization leverages Better Auth’s session cookies to issue a fresh ID token without user prompts.

## Checklist for Integrators
- [ ] Ensure your OAuth clients request `openid` and `offline_access`.
- [ ] Add `refresh_token` to each trusted client’s `grantTypes` so the initial code exchange yields a refresh token.
- [ ] Implement silent re-auth (prompt-less) in the app that consumes the ID token to rotate it before expiry.
- [ ] Cache the JWKS from `/api/auth/jwks`; the `kid` in the ID token will rotate whenever you run the JWKS rotation job (`src/lib/jwks-rotation.ts`).
- [ ] If you need longer-lived artefacts for backend-to-backend calls, consider using the Better Auth JWT plugin (`/api/auth/token`) instead of repurposing the OIDC ID token.

## Why Access Tokens Are Opaque
- In the Better Auth OIDC provider, access tokens are generated with `generateRandomString` and saved in the `oauth_access_token` table alongside their expiry and scopes (`node_modules/better-auth/dist/shared/better-auth.DNkpxiLq.mjs:858-878`).
- This design keeps access tokens lightweight and lets the authorization server enforce policy by looking up the token in storage, rather than trusting self-contained claims.
- ID tokens must be JWTs so relying parties can independently verify the subject; access tokens are intentionally opaque because they are primarily for resource servers.
- There is currently no switch to make the OIDC access token a JWT. If you need a self-contained token for API calls, use the Better Auth JWT plugin endpoint (`/api/auth/token`) or implement a custom plugin that signs its own access token payload.

## Do You Need Refresh Tokens When You Only Use ID Tokens?
- **Interactive web apps**: Not necessarily. The Better Auth session cookie keeps the user signed in. Your client can run a silent authorization (`prompt=none`) before the current ID token expires and obtain a new authorization code + ID token without ever touching the refresh token.
- **Long-lived, headless, or background clients**: You do. If the client cannot rely on the browser session cookie (for example, a CLI or backend job), a refresh token is the only way to avoid sending the user through the full authorization flow again.
- **Hybrid setups**: You can still request `offline_access` so that a refresh token exists, but continue using the silent re-auth pattern for ID-token rotation. The stored refresh token becomes an escape hatch if the browser session disappears.
- Regardless of the approach, ID tokens must be replaced when their `exp` claim is reached; holding on to an expired token will fail verification even if you have a valid refresh token stored.

## Example Silent Renewal Sequence
```text
1. Client schedules renewal a few minutes before `id_token.exp`.
2. Client opens GET https://auth.example.com/api/auth/oauth2/authorize
   ?client_id=payload-spa-client
   &response_type=code
   &redirect_uri=https://app.example.com/oidc/callback
   &scope=openid%20profile%20email%20offline_access
   &prompt=none
   &code_challenge=<PKCE_S256>
   &code_challenge_method=S256
3. Authorization endpoint detects the existing Better Auth session cookie and issues a redirect with a fresh `code`.
4. Client posts the `code` to https://auth.example.com/api/auth/oauth2/token with the original PKCE verifier.
5. Response body includes the new `id_token` that downstream services must use from now on.
```

Keep this document alongside your Payload integration guide so engineers understand why refresh tokens alone do not refresh ID tokens and what compensating logic is required.
