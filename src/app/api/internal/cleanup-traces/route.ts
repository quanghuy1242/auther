import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { pipelineRepository } from "@/lib/auth/pipeline-repository";
import { isAuthorizedRequest } from "@/lib/utils/auth-validation";

export const runtime = "nodejs";

// Retention period: 30 days in milliseconds
const TRACE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cleanup old pipeline traces and spans.
 * Called by Vercel Cron or manually.
 */
export async function POST(request: NextRequest) {
    const authorizationHeader = request.headers.get("authorization");
    const rotationSecret = request.headers.get("x-rotation-secret");

    if (!isAuthorizedRequest(authorizationHeader, rotationSecret, env.CRON_SECRET)) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const cutoffTime = new Date(Date.now() - TRACE_RETENTION_MS);

    const result = await pipelineRepository.cleanupOldTraces(cutoffTime);

    return NextResponse.json({
        success: true,
        deletedSpans: result.deletedSpans,
        deletedTraces: result.deletedTraces,
        cutoffDate: cutoffTime.toISOString(),
        retentionDays: 30,
    });
}

