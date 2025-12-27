import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { metricsRepository } from "@/lib/repositories";

type Period = "24h" | "7d" | "30d" | "12mo";

function getPeriodRange(period: Period): { from: Date; to: Date; intervalSeconds: number } {
    const now = new Date();
    const to = now;
    let from: Date;
    let intervalSeconds: number;

    switch (period) {
        case "24h":
            from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            intervalSeconds = 3600;
            break;
        case "7d":
            from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            intervalSeconds = 6 * 3600;
            break;
        case "30d":
            from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            intervalSeconds = 24 * 3600;
            break;
        case "12mo":
            from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            intervalSeconds = 30 * 24 * 3600;
            break;
    }

    return { from, to, intervalSeconds };
}

/**
 * SSE endpoint for streaming dashboard metrics updates.
 * 
 * Features:
 * - Authenticates admin users
 * - Streams metric updates every 5 seconds
 * - Supports period filtering via query param
 * - Properly handles connection cleanup
 */
export async function GET(request: NextRequest) {
    // Authenticate the request
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
    }

    // Check admin role
    const userRole = session.user.role;
    if (userRole !== "admin" && userRole !== "super_admin") {
        return new Response("Forbidden", { status: 403 });
    }

    // Get period from query params
    const period = (request.nextUrl.searchParams.get("period") as Period) || "24h";

    // Create readable stream
    const encoder = new TextEncoder();
    let intervalId: NodeJS.Timeout | null = null;
    let isConnected = true;

    const stream = new ReadableStream({
        async start(controller) {
            // Send initial data immediately
            try {
                const data = await fetchMetricsSnapshot(period);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch (error) {
                console.error("SSE initial fetch error:", error);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Initial fetch failed" })}\n\n`));
            }

            // Send updates every 5 seconds
            intervalId = setInterval(async () => {
                if (!isConnected) {
                    if (intervalId) clearInterval(intervalId);
                    return;
                }

                try {
                    const data = await fetchMetricsSnapshot(period);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                } catch (error) {
                    console.error("SSE update error:", error);
                    // Don't close connection on error, just skip this update
                }
            }, 5000);
        },
        cancel() {
            isConnected = false;
            if (intervalId) {
                clearInterval(intervalId);
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", // Disable nginx buffering
        },
    });
}

/**
 * Fetch a snapshot of key metrics for streaming.
 * This is a lighter version of the full dashboard fetch,
 * focusing on frequently-changing metrics.
 */
async function fetchMetricsSnapshot(period: Period) {
    const { from, to, intervalSeconds } = getPeriodRange(period);

    // Fetch only high-priority, frequently-changing metrics
    const [
        loginSuccess,
        loginFail,
        allowed,
        denied,
        poolActive,
        poolWaiting,
        webhookEmit,
        webhookError,
    ] = await Promise.all([
        metricsRepository.getTimeSeries("auth.login.attempt", from, to, intervalSeconds, { status: "success" }),
        metricsRepository.getTimeSeries("auth.login.attempt", from, to, intervalSeconds, { status: "fail" }),
        metricsRepository.getTimeSeries("authz.decision.count", from, to, intervalSeconds, { result: "allowed" }),
        metricsRepository.getTimeSeries("authz.decision.count", from, to, intervalSeconds, { result: "denied" }),
        metricsRepository.getLatestGauge("lua.pool.active"),
        metricsRepository.getLatestGauge("lua.pool.waiting"),
        metricsRepository.getAggregateStats("webhook.emit.count", from, to),
        metricsRepository.getAggregateStats("qstash.publish.error.count", from, to),
    ]);

    return {
        timestamp: Date.now(),
        authActivity: {
            successfulLogins: loginSuccess.reduce((acc, d) => acc + d.value, 0),
            failedLogins: loginFail.reduce((acc, d) => acc + d.value, 0),
        },
        authzHealth: {
            allowed: allowed.reduce((acc, d) => acc + d.value, 0),
            denied: denied.reduce((acc, d) => acc + d.value, 0),
        },
        pipeline: {
            poolActive,
            poolWaiting,
        },
        webhook: {
            successful: (webhookEmit.sum || 0) - (webhookError.sum || 0),
            failed: webhookError.sum || 0,
        },
    };
}
