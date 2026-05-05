# Payload Resource Token Contract

Status: R4 target contract.

## Token Roles

- Browser session cookies are application session state.
- `id_token` identifies the user to the OAuth client and keeps the OIDC login contract intact.
- `access_token` is the bearer token a client presents to Payload.
- Refresh tokens, when issued by Better Auth, are only for obtaining a new token response from Auther.

## Payload Resource Server

The Payload content API is modeled as a first-class resource server:

- resource server slug: `payload-content-api`
- resource server audience: `payload-content-api`
- authorization space slug: `payload-content`

The default slugs can be overridden without changing code:

- `PAYLOAD_RESOURCE_TOKEN_SPACE_SLUG`
- `PAYLOAD_RESOURCE_TOKEN_RESOURCE_SERVER_SLUG`

The R2 seed script creates this topology:

```sh
pnpm auth:r2:seed-payload-space
```

## Issuance Rule

Better Auth's built-in OIDC access token is opaque. During R4, Auther wraps successful OAuth token responses for clients linked to the `payload-content` authorization space with `can_trigger_contexts` or `full` access.

For clients linked to the configured authorization space, the returned `access_token` is replaced with a JWKS-signed JWT whose important claims are:

- `iss = JWT_ISSUER`
- `aud = payload-content-api`
- `sub = Auther user id`
- `token_use = access`
- `client_id` / `azp = requesting OAuth client`
- `authorization_space_id = payload-content authorization space id`
- `resource_server_id = payload-content-api resource server id`

The `id_token` remains client-audience OIDC identity material and should not be used as the Payload resource bearer.

## Payload Validation

Payload must validate:

- signature against Auther JWKS
- issuer
- expiry
- audience `payload-content-api`

`PAYLOAD_ACCEPT_CLIENT_AUDIENCES=true` is a temporary rollback switch in Payload only. It should remain disabled once R4 is deployed.
