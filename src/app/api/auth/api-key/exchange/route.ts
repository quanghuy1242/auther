import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { SignJWT, importPKCS8 } from "jose";
import { symmetricDecrypt } from "better-auth/crypto";

import { auth } from "@/lib/auth";
import { env } from "@/env";
import { jwksRepository } from "@/lib/repositories";

/**
 * JWT expiration time in seconds (15 minutes)
 */
const JWT_EXPIRATION_SECONDS = 900;

/**
 * Request body type for API key exchange
 */
interface ExchangeRequest {
  apiKey: string;
  permissions?: Record<string, string[]>;
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

/**
 * POST /api/auth/api-key/exchange
 * 
 * Exchange a valid API key for a short-lived JWT token.
 * 
 * This endpoint verifies the API key, fetches the latest JWKS signing key,
 * decrypts the private key, and signs a JWT with the user's information
 * and permissions from the API key.
 * 
 * @security
 * - No caching of decrypted private keys
 * - Short-lived JWTs (15 minutes)
 * - API key verification with permissions
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

    const { apiKey, permissions: requestedPermissions } = body;

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

    // Step 1: Verify API key using better-auth
    const verificationResult = await auth.api.verifyApiKey({
      body: {
        key: apiKey,
        ...(requestedPermissions && { permissions: requestedPermissions }),
      },
      headers: await headers(),
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
          message: "The provided API key is invalid, expired, or lacks required permissions",
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
    const permissions = apiKeyRecord.permissions || {};

    // Step 2: Fetch latest JWKS key from database
    const latestKey = await jwksRepository.findLatest();

    if (!latestKey) {
      console.error("[api-key-exchange] No JWKS key found in database");
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Token signing keys are not configured",
        },
        { status: 500 }
      );
    }

    // Step 3: Decrypt private key using BETTER_AUTH_SECRET
    let decryptedPrivateKey: string;
    try {
      decryptedPrivateKey = await symmetricDecrypt({
        key: env.BETTER_AUTH_SECRET,
        data: latestKey.privateKey,
      });
    } catch (error) {
      console.error("[api-key-exchange] Failed to decrypt private key", {
        error: error instanceof Error ? error.message : String(error),
        keyId: latestKey.id,
      });
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Failed to process signing key",
        },
        { status: 500 }
      );
    }

    // Step 4: Import the private key for signing
    let privateKey: CryptoKey;
    try {
      privateKey = await importPKCS8(decryptedPrivateKey, "RS256");
    } catch (error) {
      console.error("[api-key-exchange] Failed to import private key", {
        error: error instanceof Error ? error.message : String(error),
        keyId: latestKey.id,
      });
      return NextResponse.json(
        {
          error: "internal_error",
          message: "Failed to process signing key",
        },
        { status: 500 }
      );
    }

    // Step 5: Create and sign JWT
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + JWT_EXPIRATION_SECONDS;

    try {
      const token = await new SignJWT({
        // Custom claims
        scope: "api_key_exchange",
        permissions: permissions || {},
        apiKeyId: apiKeyRecord?.id,
      })
        .setProtectedHeader({
          alg: "RS256",
          kid: latestKey.id,
          typ: "JWT",
        })
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE[0])
        .setSubject(userId)
        .setIssuedAt(now)
        .setExpirationTime(expiresAt)
        .sign(privateKey);

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
        keyId: latestKey.id,
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
