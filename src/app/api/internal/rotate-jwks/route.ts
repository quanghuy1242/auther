import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { rotateJwksIfNeeded } from "@/lib/jwks-rotation";
import { 
  JWKS_RETENTION_WINDOW_MS, 
  JWKS_ROTATION_INTERVAL_MS 
} from "@/lib/constants";
import { isAuthorizedRequest } from "@/lib/utils/auth-validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorizationHeader = request.headers.get("authorization");
  const rotationSecret = request.headers.get("x-rotation-secret");
  
  if (!isAuthorizedRequest(authorizationHeader, rotationSecret, env.CRON_SECRET)) {
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
