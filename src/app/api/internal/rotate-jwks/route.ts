import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/env";
import {
  JWKS_RETENTION_WINDOW_MS,
  JWKS_ROTATION_INTERVAL_MS,
  rotateJwksIfNeeded,
} from "@/lib/jwks-rotation";

export const runtime = "nodejs";

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return trimmed.slice(7).trim() || null;
}

function isAuthorized(request: NextRequest): boolean {
  const expectedSecret = env.CRON_SECRET;
  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = extractBearerToken(authorizationHeader);
  if (bearerToken && bearerToken === expectedSecret) {
    return true;
  }
  const headerSecret = request.headers.get("x-rotation-secret");
  if (headerSecret && headerSecret === expectedSecret) {
    return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await rotateJwksIfNeeded();

  return NextResponse.json({
    rotated: result.rotated,
    pruned: result.pruned,
    latestKeyId: result.latestKeyId,
    latestKeyCreatedAt: result.latestKeyCreatedAt?.toISOString() ?? null,
    rotationIntervalMs: JWKS_ROTATION_INTERVAL_MS,
    retentionWindowMs: JWKS_RETENTION_WINDOW_MS,
  });
}
