import { symmetricDecrypt } from "better-auth/crypto";
import { importJWK, importPKCS8, SignJWT, type JWK } from "jose";

import { env } from "@/env";
import { rotateJwksIfNeeded } from "@/lib/jwks-rotation";
import { jwksRepository, type JwksKeyEntity } from "@/lib/repositories";

export type JwtSigningKey = Parameters<SignJWT["sign"]>[0];

export type ImportedJwtSigningKey = {
  key: JwtSigningKey;
  keyId: string;
  alg: string;
};

function parseEncryptedPrivateKeyData(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

export async function importJwtSigningKey(
  jwksKey: Pick<JwksKeyEntity, "id" | "privateKey">
): Promise<ImportedJwtSigningKey> {
  const decryptedPrivateKey = await symmetricDecrypt({
    key: env.BETTER_AUTH_SECRET,
    data: parseEncryptedPrivateKeyData(jwksKey.privateKey),
  });

  const trimmedKey = decryptedPrivateKey.trim();

  if (trimmedKey.startsWith("{")) {
    const jwk = JSON.parse(trimmedKey) as JWK;
    const alg = typeof jwk.alg === "string" ? jwk.alg : jwk.kty === "OKP" ? "EdDSA" : "RS256";

    return {
      key: await importJWK(jwk, alg),
      keyId: jwksKey.id,
      alg,
    };
  }

  return {
    key: await importPKCS8(trimmedKey, "RS256"),
    keyId: jwksKey.id,
    alg: "RS256",
  };
}

export async function importLatestJwtSigningKey(options?: {
  rotateBeforeLoad?: boolean;
}): Promise<ImportedJwtSigningKey | null> {
  if (options?.rotateBeforeLoad) {
    await rotateJwksIfNeeded();
  }

  const latestKey = await jwksRepository.findLatest();
  if (!latestKey) {
    return null;
  }

  return importJwtSigningKey(latestKey);
}
