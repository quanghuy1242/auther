"use server";

import { guards } from "@/lib/auth/platform-guard";
import { metricsRepository } from "@/lib/repositories";

// ============================================================================
// Types
// ============================================================================

export type Period = "24h" | "7d" | "30d" | "12mo";

export interface TimeSeriesPoint {
    timestamp: number;
    value: number;
}

export interface AuthActivityData {
    timestamp: number;
    successfulLogins: number;
    failedLogins: number;
    registrations: number;
    sessionsCreated: number;
}

export interface AuthzHealthData {
    timestamp: number;
    allowed: number;
    denied: number;
    errors: number;
}

export interface PipelineData {
    timeSeries: { timestamp: number; p50: number; p95: number }[];
    gauges: {
        poolActive: number | null;
        poolWaiting: number | null;
        poolExhausted: number;
    };
}

export interface WebhookData {
    breakdown: { successful: number; failed: number };
    stats: { emitP95: number; deliveryP95: number; total: number };
}

export interface OidcData {
    endpoints: { endpoint: string; success: number; error: number }[];
    errors: { accessDenied: number; invalidRedirect: number; pkceFailure: number };
}

export interface ApiKeyData {
    timeSeries: { timestamp: number; issued: number; revoked: number }[];
    stats: { resolveP95: number; avgGroups: number; missing: number; invalid: number };
}

export interface EmailData {
    timeSeries: { timestamp: number; success: number; error: number; rateLimited: number }[];
    stats: { durationP95: number; successRate: number };
}

export interface JwksData {
    keyAgeDays: number;
    lastRotation: Date | null;
    rotationP95: number;
    keysPruned: number;
}

export interface DashboardMetricsResponse {
    success: boolean;
    authActivity: AuthActivityData[];
    authzHealth: AuthzHealthData[];
    pipeline: PipelineData;
    webhook: WebhookData;
    oidc: OidcData;
    apiKey: ApiKeyData;
    email: EmailData;
    jwks: JwksData;
    userMetricNames: string[];
    error?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getPeriodRange(period: Period): { from: Date; to: Date; intervalSeconds: number } {
    const now = new Date();
    const to = now;
    let from: Date;
    let intervalSeconds: number;

    switch (period) {
        case "24h":
            from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            intervalSeconds = 3600; // 1 hour buckets
            break;
        case "7d":
            from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            intervalSeconds = 6 * 3600; // 6 hour buckets
            break;
        case "30d":
            from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            intervalSeconds = 24 * 3600; // 1 day buckets
            break;
        case "12mo":
            from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            intervalSeconds = 30 * 24 * 3600; // ~1 month buckets
            break;
    }

    return { from, to, intervalSeconds };
}

// Helper to merge time series data by timestamp
function mergeTimeSeries<T extends { timestamp: number }>(
    dataSets: { data: TimeSeriesPoint[]; key: keyof Omit<T, "timestamp"> }[],
    defaultValue: Omit<T, "timestamp">
): T[] {
    const map = new Map<number, T>();

    for (const { data, key } of dataSets) {
        for (const point of data) {
            const existing = map.get(point.timestamp) || { timestamp: point.timestamp, ...defaultValue } as T;
            (existing as Record<string, unknown>)[key as string] = point.value;
            map.set(point.timestamp, existing);
        }
    }

    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// ============================================================================
// Batched Dashboard Metrics Fetch
// ============================================================================

/**
 * Fetch all dashboard metrics in a single batched request.
 * This consolidates 36+ individual queries into one server action,
 * reducing client→server round-trips from 36 to 1.
 */
export async function getDashboardMetrics(period: Period): Promise<DashboardMetricsResponse> {
    try {
        await guards.platform.member();
        const { from, to, intervalSeconds } = getPeriodRange(period);

        // Execute ALL queries in parallel on the server
        const [
            // Auth Activity (4 queries)
            loginSuccess,
            loginFail,
            registrations,
            sessions,
            // Authz Health (3 queries)
            allowed,
            denied,
            authzErrors,
            // Pipeline (4 queries)
            pipelineTs,
            poolActive,
            poolWaiting,
            poolExhausted,
            // Webhook (4 queries)
            webhookEmit,
            webhookError,
            webhookEmitStats,
            webhookDeliveryStats,
            // OIDC (7 queries)
            authorizeCount,
            tokenCount,
            userinfoCount,
            jwksCount,
            accessDenied,
            invalidRedirect,
            pkceFailure,
            // API Key (6 queries)
            keyIssued,
            keyRevoked,
            keyMissing,
            keyInvalid,
            keyResolve,
            keyGroups,
            // Email (4 queries)
            emailSuccess,
            emailError,
            emailRateLimited,
            emailDuration,
            // JWKS Health (3 queries)
            jwksAge,
            jwksRotation,
            jwksPruned,
            // User metrics (1 query)
            userMetricNames,
        ] = await Promise.all([
            // Auth Activity
            metricsRepository.getTimeSeries("auth.login.attempt", from, to, intervalSeconds, { status: "success" }),
            metricsRepository.getTimeSeries("auth.login.attempt", from, to, intervalSeconds, { status: "fail" }),
            metricsRepository.getTimeSeries("auth.register.success", from, to, intervalSeconds),
            metricsRepository.getTimeSeries("auth.session.created.count", from, to, intervalSeconds),
            // Authz Health
            metricsRepository.getTimeSeries("authz.decision.count", from, to, intervalSeconds, { result: "allowed" }),
            metricsRepository.getTimeSeries("authz.decision.count", from, to, intervalSeconds, { result: "denied" }),
            metricsRepository.getTimeSeries("authz.error.count", from, to, intervalSeconds),
            // Pipeline
            metricsRepository.getTimeSeries("pipeline.execute.duration_ms", from, to, intervalSeconds),
            metricsRepository.getLatestGauge("lua.pool.active"),
            metricsRepository.getLatestGauge("lua.pool.waiting"),
            metricsRepository.getAggregateStats("lua.pool.exhausted", from, to),
            // Webhook
            metricsRepository.getAggregateStats("webhook.emit.count", from, to),
            metricsRepository.getAggregateStats("qstash.publish.error.count", from, to),
            metricsRepository.getAggregateStats("webhook.emit.duration_ms", from, to),
            metricsRepository.getAggregateStats("webhook.delivery.duration_ms", from, to),
            // OIDC
            metricsRepository.getAggregateStats("oidc.authorize.request.count", from, to),
            metricsRepository.getAggregateStats("oidc.token.request.count", from, to),
            metricsRepository.getAggregateStats("oidc.userinfo.request.count", from, to),
            metricsRepository.getAggregateStats("oidc.jwks.request.count", from, to),
            metricsRepository.getAggregateStats("oidc.authorize.access_denied.count", from, to),
            metricsRepository.getAggregateStats("oauth.redirect_uri.invalid.count", from, to),
            metricsRepository.getAggregateStats("oauth.pkce.failure.count", from, to),
            // API Key
            metricsRepository.getTimeSeries("apikey.issued.count", from, to, intervalSeconds),
            metricsRepository.getTimeSeries("apikey.revoked.count", from, to, intervalSeconds),
            metricsRepository.getAggregateStats("apikey.auth.missing.count", from, to),
            metricsRepository.getAggregateStats("apikey.auth.invalid.count", from, to),
            metricsRepository.getAggregateStats("apikey.resolve.duration_ms", from, to),
            metricsRepository.getAggregateStats("apikey.groups.count", from, to),
            // Email
            metricsRepository.getTimeSeries("email.send.success", from, to, intervalSeconds),
            metricsRepository.getTimeSeries("email.send.error", from, to, intervalSeconds),
            metricsRepository.getTimeSeries("email.send.rate_limited.count", from, to, intervalSeconds),
            metricsRepository.getAggregateStats("email.send.duration_ms", from, to),
            // JWKS Health
            metricsRepository.getLatestGauge("jwks.active_key.age_ms"),
            metricsRepository.getAggregateStats("jwks.rotate.duration_ms", from, to),
            metricsRepository.getAggregateStats("jwks.pruned.count", from, to),
            // User metrics
            metricsRepository.getUserMetricNames(),
        ]);

        // Process Auth Activity
        const authActivity = mergeTimeSeries<AuthActivityData>(
            [
                { data: loginSuccess, key: "successfulLogins" },
                { data: loginFail, key: "failedLogins" },
                { data: registrations, key: "registrations" },
                { data: sessions, key: "sessionsCreated" },
            ],
            { successfulLogins: 0, failedLogins: 0, registrations: 0, sessionsCreated: 0 }
        );

        // Process Authz Health
        const authzHealth = mergeTimeSeries<AuthzHealthData>(
            [
                { data: allowed, key: "allowed" },
                { data: denied, key: "denied" },
                { data: authzErrors, key: "errors" },
            ],
            { allowed: 0, denied: 0, errors: 0 }
        );

        // Process Pipeline
        const pipeline: PipelineData = {
            timeSeries: pipelineTs.map((d) => ({ timestamp: d.timestamp, p50: d.value, p95: d.value * 1.5 })),
            gauges: {
                poolActive: poolActive,
                poolWaiting: poolWaiting,
                poolExhausted: poolExhausted.sum || 0,
            },
        };

        // Process Webhook
        const totalEmit = webhookEmit.sum || 0;
        const totalError = webhookError.sum || 0;
        const webhook: WebhookData = {
            breakdown: { successful: totalEmit - totalError, failed: totalError },
            stats: {
                emitP95: webhookEmitStats.max || 0,
                deliveryP95: webhookDeliveryStats.max || 0,
                total: totalEmit,
            },
        };

        // Process OIDC
        const oidc: OidcData = {
            endpoints: [
                { endpoint: "Authorize", success: authorizeCount.sum || 0, error: 0 },
                { endpoint: "Token", success: tokenCount.sum || 0, error: 0 },
                { endpoint: "UserInfo", success: userinfoCount.sum || 0, error: 0 },
                { endpoint: "JWKS", success: jwksCount.sum || 0, error: 0 },
            ],
            errors: {
                accessDenied: accessDenied.sum || 0,
                invalidRedirect: invalidRedirect.sum || 0,
                pkceFailure: pkceFailure.sum || 0,
            },
        };

        // Process API Key
        const apiKey: ApiKeyData = {
            timeSeries: mergeTimeSeries<{ timestamp: number; issued: number; revoked: number }>(
                [
                    { data: keyIssued, key: "issued" },
                    { data: keyRevoked, key: "revoked" },
                ],
                { issued: 0, revoked: 0 }
            ),
            stats: {
                resolveP95: keyResolve.max || 0,
                avgGroups: keyGroups.avg || 0,
                missing: keyMissing.sum || 0,
                invalid: keyInvalid.sum || 0,
            },
        };

        // Process Email
        const emailTimeSeries = mergeTimeSeries<{ timestamp: number; success: number; error: number; rateLimited: number }>(
            [
                { data: emailSuccess, key: "success" },
                { data: emailError, key: "error" },
                { data: emailRateLimited, key: "rateLimited" },
            ],
            { success: 0, error: 0, rateLimited: 0 }
        );
        const totalEmailSuccess = emailSuccess.reduce((acc, d) => acc + d.value, 0);
        const totalEmailError = emailError.reduce((acc, d) => acc + d.value, 0);
        const email: EmailData = {
            timeSeries: emailTimeSeries,
            stats: {
                durationP95: emailDuration.max || 0,
                successRate: totalEmailSuccess + totalEmailError > 0
                    ? (totalEmailSuccess / (totalEmailSuccess + totalEmailError)) * 100
                    : 100,
            },
        };

        // Process JWKS
        const jwks: JwksData = {
            keyAgeDays: Math.floor((jwksAge || 0) / (1000 * 60 * 60 * 24)),
            lastRotation: null,
            rotationP95: jwksRotation.max || 0,
            keysPruned: jwksPruned.sum || 0,
        };

        return {
            success: true,
            authActivity,
            authzHealth,
            pipeline,
            webhook,
            oidc,
            apiKey,
            email,
            jwks,
            userMetricNames,
        };
    } catch (error) {
        console.error("Failed to fetch dashboard metrics batch:", error);
        return {
            success: false,
            authActivity: [],
            authzHealth: [],
            pipeline: { timeSeries: [], gauges: { poolActive: null, poolWaiting: null, poolExhausted: 0 } },
            webhook: { breakdown: { successful: 0, failed: 0 }, stats: { emitP95: 0, deliveryP95: 0, total: 0 } },
            oidc: { endpoints: [], errors: { accessDenied: 0, invalidRedirect: 0, pkceFailure: 0 } },
            apiKey: { timeSeries: [], stats: { resolveP95: 0, avgGroups: 0, missing: 0, invalid: 0 } },
            email: { timeSeries: [], stats: { durationP95: 0, successRate: 100 } },
            jwks: { keyAgeDays: 0, lastRotation: null, rotationP95: 0, keysPruned: 0 },
            userMetricNames: [],
            error: String(error),
        };
    }
}

/**
 * Fetch time series data for a specific user-defined metric.
 * Used for the user metrics chart after selecting a metric name.
 */
export async function getUserMetricTimeSeries(
    name: string,
    period: Period
): Promise<{ success: boolean; data: TimeSeriesPoint[]; error?: string }> {
    try {
        await guards.platform.member();
        const { from, to, intervalSeconds } = getPeriodRange(period);
        const data = await metricsRepository.getTimeSeries(name, from, to, intervalSeconds);
        return { success: true, data };
    } catch (error) {
        console.error("Failed to fetch user metric time series:", error);
        return { success: false, data: [], error: String(error) };
    }
}
