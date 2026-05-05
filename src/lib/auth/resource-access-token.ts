import { SignJWT } from "jose";

import { env } from "@/env";
import { importLatestJwtSigningKey } from "@/lib/auth/jwt-signing-key";
import { resourceAccessTokenRepository } from "@/lib/repositories";

const PAYLOAD_CONTENT_SPACE_SLUG = "payload-content";
const PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG = "payload-content-api";
const PAYLOAD_RESOURCE_TOKEN_ACCESS_MODES = ["can_trigger_contexts", "full"] as const;

export type ResourceAccessTokenResult = {
  accessToken: string;
  expiresIn: number;
  audience: string;
};

const getTimestampSeconds = (value: Date | number | null | undefined): number | null => {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }

  return Math.floor(value / 1000);
};

function getPayloadResourceTokenConfig() {
  const authorizationSpaceSlug = env.PAYLOAD_RESOURCE_TOKEN_SPACE_SLUG ?? PAYLOAD_CONTENT_SPACE_SLUG;
  const resourceServerSlug =
    env.PAYLOAD_RESOURCE_TOKEN_RESOURCE_SERVER_SLUG ?? PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG;

  return {
    authorizationSpaceSlug,
    resourceServerSlug,
  };
}

export async function mintPayloadResourceAccessToken(
  opaqueAccessToken: string,
): Promise<ResourceAccessTokenResult | null> {
  const source = await resourceAccessTokenRepository.findSourceByOpaqueAccessToken({
    opaqueAccessToken,
    ...getPayloadResourceTokenConfig(),
    accessModes: [...PAYLOAD_RESOURCE_TOKEN_ACCESS_MODES],
  });

  if (!source) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = getTimestampSeconds(source.accessTokenExpiresAt) ?? now + 2 * 24 * 60 * 60;
  const expiresIn = Math.max(1, expiresAt - now);
  const signingKey = await importLatestJwtSigningKey({ rotateBeforeLoad: true });

  if (!signingKey) {
    throw new Error("No JWKS signing key is available.");
  }

  const token = await new SignJWT({
    token_use: "access",
    scope: source.scope ?? "",
    client_id: source.clientId,
    azp: source.clientId,
    email: source.userEmail,
    name: source.userName,
    roles: source.userRole ? [source.userRole] : undefined,
    resource_server_id: source.resourceServerId,
    authorization_space_id: source.authorizationSpaceId,
  })
    .setProtectedHeader({
      alg: signingKey.alg,
      kid: signingKey.keyId,
      typ: "JWT",
    })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(source.resourceServerAudience)
    .setSubject(source.userId)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .sign(signingKey.key);

  return {
    accessToken: token,
    expiresIn,
    audience: source.resourceServerAudience,
  };
}
