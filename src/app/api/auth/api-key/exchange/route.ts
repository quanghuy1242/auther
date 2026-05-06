import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

import { auth } from "@/lib/auth";
import { env } from "@/env";
import { apiKeyPermissionResolver } from "@/lib/services";
import { importLatestJwtSigningKey } from "@/lib/auth/jwt-signing-key";

/**
 * JWT expiration time in seconds (15 minutes)
 */
const JWT_EXPIRATION_SECONDS = 900;

/**
 * Request body type for API key exchange
 */
interface ExchangeRequest {
  apiKey: string;
  // Note: Permissions are resolved from ReBAC tuples, not from request body
}

/**
 * Response type for successful API key exchange
 */
interface ExchangeResponse {
  token: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: string;
}

/**
 * Error response type
 */
interface ErrorResponse {
  error: string;
  message: string;
}

function scopeClaimsToAuthorizationSpace(
  claims: Record<string, string[]>,
  authorizationSpaceId: string
): { scoped: Record<string, string[]>; droppedCount: number } {
  const scoped: Record<string, string[]> = {};
  let droppedCount = 0;

  for (const [entityKey, permissions] of Object.entries(claims)) {
    if (entityKey === "authorization_space" || entityKey.startsWith("authorization_space:")) {
      const [, entityId] = entityKey.split(":");
      if (!entityId || entityId === authorizationSpaceId) {
        scoped[entityKey] = permissions;
      } else {
        droppedCount += 1;
      }
      continue;
    }

    if (entityKey.startsWith("client_") || entityKey.startsWith("oauth_client:")) {
      droppedCount += 1;
      continue;
    }

    scoped[entityKey] = permissions;
  }

  return { scoped, droppedCount };
}

/**
 * POST /api/auth/api-key/exchange
 * 
 * Exchange a valid API key for a short-lived JWT token.
 * 
 * This endpoint verifies the API key, resolves permissions from ReBAC tuples,
 * and signs a JWT with the user's information and resolved permissions.
 * 
 * @security
 * - No caching of decrypted private keys
 * - Short-lived JWTs (15 minutes)
 * - Permissions resolved from ReBAC tuples (not from request)
 * - Audit logging of all requests
 */
export async function POST(request: NextRequest): Promise<NextResponse<ExchangeResponse | ErrorResponse>> {
  try {
    // Parse request body
    let body: ExchangeRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: "Invalid JSON in request body",
        },
        { status: 400 }
      );
    }

    const { apiKey } = body;

    // Validate API key presence
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
      return NextResponse.json(
        {
          error: "missing_api_key",
          message: "API key is required",
        },
        { status: 400 }
      );
    }

    // Step 1: Verify API key using better-auth (validates key is active)
    // Note: We do NOT pass permissions here - ReBAC is our permission source
    const verificationResult = await auth.api.verifyApiKey({
      body: { key: apiKey },
      headers: request.headers,
    });

    // Handle invalid API key
    if (!verificationResult || !verificationResult.valid) {
      console.warn("[api-key-exchange] Invalid API key attempted", {
        timestamp: new Date().toISOString(),
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      });

      return NextResponse.json(
        {
          error: "invalid_api_key",
          message: "The provided API key is invalid or expired",
        },
        { status: 401 }
      );
    }

    // Extract key data from verification result
    const apiKeyRecord = verificationResult.key;

    // Validate that we have required data
    if (!apiKeyRecord || !apiKeyRecord.userId) {
      console.error("[api-key-exchange] API key verification succeeded but no key data returned");
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Failed to extract user information from API key",
        },
        { status: 500 }
      );
    }

    const userId = apiKeyRecord.userId;
    const keyAuthorizationSpaceId =
      typeof apiKeyRecord.metadata?.authorization_space_id === "string"
        ? apiKeyRecord.metadata.authorization_space_id
        : null;

    if (!keyAuthorizationSpaceId) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "API key is missing authorization space metadata",
        },
        { status: 403 }
      );
    }

    // Step 2: Resolve permissions from ReBAC tuples with ABAC metadata
    // The abac_required field tells consuming services which permissions need
    // runtime ABAC evaluation via POST /api/auth/check-permission
    let permissions: Record<string, string[]> = {};
    let abac_required: Record<string, string[]> = {};
    let authorization_space_full_access: string[] | undefined;
    try {
      const [result, resolvedSpaceFullAccess] = await Promise.all([
        apiKeyPermissionResolver.resolvePermissionsWithABACInfo(apiKeyRecord.id),
        apiKeyPermissionResolver.resolveAuthorizationSpaceFullAccess(apiKeyRecord.id),
      ]);

      const scopedPermissions = scopeClaimsToAuthorizationSpace(result.permissions, keyAuthorizationSpaceId);
      const scopedAbacRequired = scopeClaimsToAuthorizationSpace(result.abac_required, keyAuthorizationSpaceId);

      permissions = scopedPermissions.scoped;
      abac_required = scopedAbacRequired.scoped;

      if (scopedPermissions.droppedCount > 0 || scopedAbacRequired.droppedCount > 0) {
        console.warn("[api-key-exchange] Filtered out-of-scope JWT claims", {
          apiKeyId: apiKeyRecord.id,
          authorizationSpaceId: keyAuthorizationSpaceId,
          droppedPermissions: scopedPermissions.droppedCount,
          droppedAbacRequired: scopedAbacRequired.droppedCount,
        });
      }

      const spaceFullAccess = keyAuthorizationSpaceId
        ? resolvedSpaceFullAccess.filter((spaceId) => spaceId === keyAuthorizationSpaceId)
        : [];
      authorization_space_full_access = spaceFullAccess.length > 0 ? spaceFullAccess : undefined;

      console.info("[api-key-exchange] ReBAC permissions resolved", {
        apiKeyId: apiKeyRecord.id,
        permissionCount: Object.keys(permissions).length,
        abacRequiredCount: Object.keys(abac_required).length,
        authorizationSpaceFullAccessCount: authorization_space_full_access?.length ?? 0,
      });
    } catch (error) {
      console.error("[api-key-exchange] Failed to resolve ReBAC permissions", {
        apiKeyId: apiKeyRecord.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Failed to resolve permissions for API key",
        },
        { status: 500 }
      );
    }

    // Step 3: Load the latest JWKS signing key from Better Auth's key store.
    let signingKey: Awaited<ReturnType<typeof importLatestJwtSigningKey>>;
    try {
      signingKey = await importLatestJwtSigningKey();
    } catch (error) {
      console.error("[api-key-exchange] Failed to load signing key", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Failed to process signing key",
        },
        { status: 500 }
      );
    }

    if (!signingKey) {
      console.error("[api-key-exchange] No JWKS key found in database");
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Token signing keys are not configured",
        },
        { status: 500 }
      );
    }

    // Step 4: Create and sign JWT
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + JWT_EXPIRATION_SECONDS;

    try {
      const token = await new SignJWT({
        // Custom claims
        scope: "api_key_exchange",
        permissions: permissions || {},
        // ABAC metadata: permissions listed here require runtime ABAC evaluation
        // Consuming services MUST call POST /api/auth/check-permission for these
        // with the actual resource context (e.g., invoice.amount) to get access decision
        abac_required: Object.keys(abac_required).length > 0 ? abac_required : undefined,
        authorization_space_full_access,
        apiKeyId: apiKeyRecord?.id,
      })
        .setProtectedHeader({
          alg: signingKey.alg,
          kid: signingKey.keyId,
          typ: "JWT",
        })
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE[0])
        .setSubject(userId)
        .setIssuedAt(now)
        .setExpirationTime(expiresAt)
        .sign(signingKey.key);

      // Log successful exchange for audit trail
      console.info("[api-key-exchange] Successful token exchange", {
        timestamp: new Date().toISOString(),
        userId,
        apiKeyId: apiKeyRecord.id,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      });

      return NextResponse.json(
        {
          token,
          tokenType: "Bearer",
          expiresIn: JWT_EXPIRATION_SECONDS,
          expiresAt: new Date(expiresAt * 1000).toISOString(),
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("[api-key-exchange] Failed to sign JWT", {
        error: error instanceof Error ? error.message : String(error),
        userId,
        keyId: signingKey.keyId,
      });
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Failed to generate token",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    // Catch-all for unexpected errors
    console.error("[api-key-exchange] Unexpected error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "internal_error",
        message: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
