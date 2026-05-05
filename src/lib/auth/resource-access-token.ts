import { and, eq, inArray } from "drizzle-orm";
import { importJWK, importPKCS8, SignJWT, type JWK } from "jose";
import { symmetricDecrypt } from "better-auth/crypto";

import { authorizationSpaces, oauthAccessToken, oauthClientSpaceLinks, resourceServers, user } from "@/db/schema";
import { env } from "@/env";
import { db } from "@/lib/db";
import { jwksRepository } from "@/lib/repositories";
import { rotateJwksIfNeeded } from "@/lib/jwks-rotation";

const PAYLOAD_CONTENT_SPACE_SLUG = "payload-content";
const PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG = "payload-content-api";

type ResourceTokenSource = {
  accessTokenExpiresAt: Date | null;
  clientId: string;
  scope: string | null;
  userEmail: string;
  userId: string;
  userName: string;
  userRole: string | null;
  resourceServerAudience: string;
  resourceServerId: string;
  authorizationSpaceId: string;
};

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

async function findPayloadResourceTokenSource(
  opaqueAccessToken: string,
): Promise<ResourceTokenSource | null> {
  const [row] = await db
    .select({
      accessTokenExpiresAt: oauthAccessToken.accessTokenExpiresAt,
      clientId: oauthAccessToken.clientId,
      scope: oauthAccessToken.scopes,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userRole: user.role,
      resourceServerAudience: resourceServers.audience,
      resourceServerId: resourceServers.id,
      authorizationSpaceId: authorizationSpaces.id,
    })
    .from(oauthAccessToken)
    .innerJoin(user, eq(oauthAccessToken.userId, user.id))
    .innerJoin(oauthClientSpaceLinks, eq(oauthAccessToken.clientId, oauthClientSpaceLinks.clientId))
    .innerJoin(authorizationSpaces, eq(oauthClientSpaceLinks.authorizationSpaceId, authorizationSpaces.id))
    .innerJoin(resourceServers, eq(authorizationSpaces.resourceServerId, resourceServers.id))
    .where(
      and(
        eq(oauthAccessToken.accessToken, opaqueAccessToken),
        eq(authorizationSpaces.slug, PAYLOAD_CONTENT_SPACE_SLUG),
        eq(authorizationSpaces.enabled, true),
        eq(resourceServers.slug, PAYLOAD_CONTENT_RESOURCE_SERVER_SLUG),
        eq(resourceServers.enabled, true),
        inArray(oauthClientSpaceLinks.accessMode, ["can_trigger_contexts", "full"]),
      ),
    );

  if (!row?.clientId) {
    return null;
  }

  return row as ResourceTokenSource;
}

type JwtSigningKey = Parameters<SignJWT["sign"]>[0];

async function importLatestSigningKey(): Promise<{ key: JwtSigningKey; keyId: string; alg: string }> {
  await rotateJwksIfNeeded();

  const latestKey = await jwksRepository.findLatest();
  if (!latestKey) {
    throw new Error("No JWKS signing key is available.");
  }

  const decryptedPrivateKey = await symmetricDecrypt({
    key: env.BETTER_AUTH_SECRET,
    data: latestKey.privateKey,
  });

  const trimmedKey = decryptedPrivateKey.trim();

  if (trimmedKey.startsWith("{")) {
    const jwk = JSON.parse(trimmedKey) as JWK;
    const alg = typeof jwk.alg === "string" ? jwk.alg : jwk.kty === "OKP" ? "EdDSA" : "RS256";

    return {
      key: await importJWK(jwk, alg),
      keyId: latestKey.id,
      alg,
    };
  }

  return {
    key: await importPKCS8(trimmedKey, "RS256"),
    keyId: latestKey.id,
    alg: "RS256",
  };
}

export async function mintPayloadResourceAccessToken(
  opaqueAccessToken: string,
): Promise<ResourceAccessTokenResult | null> {
  const source = await findPayloadResourceTokenSource(opaqueAccessToken);

  if (!source) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = getTimestampSeconds(source.accessTokenExpiresAt) ?? now + 2 * 24 * 60 * 60;
  const expiresIn = Math.max(1, expiresAt - now);
  const signingKey = await importLatestSigningKey();

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
