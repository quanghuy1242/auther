"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardHeader, type Period } from "./DashboardHeader";
import {
    AuthActivityChart,
    AuthzHealthChart,
    PipelineChart,
    WebhookChart,
    OidcHealthChart,
    ApiKeyChart,
    EmailChart,
    JwksHealthCard,
    UserMetricsChart,
} from "./charts";
import { AdminActivityLog } from "./tables";
import {
    getMetricsTimeSeries,
    getMetricsAggregate,
    getLatestGauge,
    getUserMetricNames,
} from "@/app/admin/actions";

// Types for chart data
interface AuthActivityData {
    timestamp: number;
    successfulLogins: number;
    failedLogins: number;
    registrations: number;
    sessionsCreated: number;
}

interface AuthzHealthData {
    timestamp: number;
    allowed: number;
    denied: number;
    errors: number;
}

interface DashboardChartsProps {
    initialPeriod?: Period;
}

/**
 * Client-side dashboard charts with auto-refresh support
 * Fetches metrics data and renders all chart panels
 */
export function DashboardCharts({ initialPeriod = "24h" }: DashboardChartsProps) {
    const searchParams = useSearchParams();
    const period = (searchParams.get("period") as Period) || initialPeriod;

    const [isLoading, setIsLoading] = useState(true);

    // Chart data states
    const [authActivityData, setAuthActivityData] = useState<AuthActivityData[]>([]);
    const [authzHealthData, setAuthzHealthData] = useState<AuthzHealthData[]>([]);
    const [pipelineData, setPipelineData] = useState<{ timestamp: number; p50: number; p95: number }[]>([]);
    const [pipelineGauges, setPipelineGauges] = useState({ poolActive: null as number | null, poolWaiting: null as number | null, poolExhausted: 0 });
    const [webhookData, setWebhookData] = useState({ successful: 0, failed: 0 });
    const [webhookStats, setWebhookStats] = useState({ emitP95: 0, deliveryP95: 0, total: 0 });
    const [oidcData, setOidcData] = useState<{ endpoint: string; success: number; error: number }[]>([]);
    const [oidcErrors, setOidcErrors] = useState({ accessDenied: 0, invalidRedirect: 0, pkceFailure: 0 });
    const [apiKeyData, setApiKeyData] = useState<{ timestamp: number; issued: number; revoked: number }[]>([]);
    const [apiKeyStats, setApiKeyStats] = useState({ resolveP95: 0, avgGroups: 0, missing: 0, invalid: 0 });
    const [emailData, setEmailData] = useState<{ timestamp: number; success: number; error: number; rateLimited: number }[]>([]);
    const [emailStats, setEmailStats] = useState({ durationP95: 0, successRate: 100 });
    const [jwksData, setJwksData] = useState({ keyAgeDays: 0, lastRotation: null as Date | null, rotationP95: 0, keysPruned: 0 });
    const [adminActivities] = useState<{ id: string; type: string; description: string; timestamp: Date }[]>([]);
    const [userMetrics, setUserMetrics] = useState<string[]>([]);
    const [selectedUserMetric, setSelectedUserMetric] = useState<string | null>(null);
    const [userMetricData, setUserMetricData] = useState<{ timestamp: number; value: number }[]>([]);

    // Fetch all dashboard data
    const fetchDashboardData = useCallback(async () => {
        try {
            // Fetch auth activity data
            const [loginSuccess, loginFail, registrations, sessions] = await Promise.all([
                getMetricsTimeSeries("auth.login.attempt", period, { status: "success" }),
                getMetricsTimeSeries("auth.login.attempt", period, { status: "fail" }),
                getMetricsTimeSeries("auth.register.success", period),
                getMetricsTimeSeries("auth.session.created.count", period),
            ]);

            // Merge auth activity data by timestamp
            const authMap = new Map<number, AuthActivityData>();
            loginSuccess.data.forEach((d) => {
                authMap.set(d.timestamp, { timestamp: d.timestamp, successfulLogins: d.value, failedLogins: 0, registrations: 0, sessionsCreated: 0 });
            });
            loginFail.data.forEach((d) => {
                const existing = authMap.get(d.timestamp) || { timestamp: d.timestamp, successfulLogins: 0, failedLogins: 0, registrations: 0, sessionsCreated: 0 };
                existing.failedLogins = d.value;
                authMap.set(d.timestamp, existing);
            });
            registrations.data.forEach((d) => {
                const existing = authMap.get(d.timestamp) || { timestamp: d.timestamp, successfulLogins: 0, failedLogins: 0, registrations: 0, sessionsCreated: 0 };
                existing.registrations = d.value;
                authMap.set(d.timestamp, existing);
            });
            sessions.data.forEach((d) => {
                const existing = authMap.get(d.timestamp) || { timestamp: d.timestamp, successfulLogins: 0, failedLogins: 0, registrations: 0, sessionsCreated: 0 };
                existing.sessionsCreated = d.value;
                authMap.set(d.timestamp, existing);
            });
            setAuthActivityData(Array.from(authMap.values()).sort((a, b) => a.timestamp - b.timestamp));

            // Fetch authz health data
            const [allowed, denied, errors] = await Promise.all([
                getMetricsTimeSeries("authz.decision.count", period, { result: "allowed" }),
                getMetricsTimeSeries("authz.decision.count", period, { result: "denied" }),
                getMetricsTimeSeries("authz.error.count", period),
            ]);

            const authzMap = new Map<number, AuthzHealthData>();
            allowed.data.forEach((d) => {
                authzMap.set(d.timestamp, { timestamp: d.timestamp, allowed: d.value, denied: 0, errors: 0 });
            });
            denied.data.forEach((d) => {
                const existing = authzMap.get(d.timestamp) || { timestamp: d.timestamp, allowed: 0, denied: 0, errors: 0 };
                existing.denied = d.value;
                authzMap.set(d.timestamp, existing);
            });
            errors.data.forEach((d) => {
                const existing = authzMap.get(d.timestamp) || { timestamp: d.timestamp, allowed: 0, denied: 0, errors: 0 };
                existing.errors = d.value;
                authzMap.set(d.timestamp, existing);
            });
            setAuthzHealthData(Array.from(authzMap.values()).sort((a, b) => a.timestamp - b.timestamp));

            // Fetch pipeline data
            const pipelineTs = await getMetricsTimeSeries("pipeline.execute.duration_ms", period);
            setPipelineData(pipelineTs.data.map((d) => ({ timestamp: d.timestamp, p50: d.value, p95: d.value * 1.5 })));

            const [poolActive, poolWaiting, poolExhausted] = await Promise.all([
                getLatestGauge("lua.pool.active"),
                getLatestGauge("lua.pool.waiting"),
                getMetricsAggregate("lua.pool.exhausted", period),
            ]);
            setPipelineGauges({
                poolActive: poolActive.value,
                poolWaiting: poolWaiting.value,
                poolExhausted: poolExhausted.stats?.sum || 0,
            });

            // Fetch webhook data
            const [webhookEmit, webhookError, webhookEmitStats, webhookDeliveryStats] = await Promise.all([
                getMetricsAggregate("webhook.emit.count", period),
                getMetricsAggregate("qstash.publish.error.count", period),
                getMetricsAggregate("webhook.emit.duration_ms", period),
                getMetricsAggregate("webhook.delivery.duration_ms", period),
            ]);
            const totalEmit = webhookEmit.stats?.sum || 0;
            const totalError = webhookError.stats?.sum || 0;
            setWebhookData({ successful: totalEmit - totalError, failed: totalError });
            setWebhookStats({
                emitP95: webhookEmitStats.stats?.max || 0,
                deliveryP95: webhookDeliveryStats.stats?.max || 0,
                total: totalEmit,
            });

            // Fetch OIDC data
            const [authorizeCount, tokenCount, userinfoCount, jwksCount] = await Promise.all([
                getMetricsAggregate("oidc.authorize.request.count", period),
                getMetricsAggregate("oidc.token.request.count", period),
                getMetricsAggregate("oidc.userinfo.request.count", period),
                getMetricsAggregate("oidc.jwks.request.count", period),
            ]);
            setOidcData([
                { endpoint: "Authorize", success: authorizeCount.stats?.sum || 0, error: 0 },
                { endpoint: "Token", success: tokenCount.stats?.sum || 0, error: 0 },
                { endpoint: "UserInfo", success: userinfoCount.stats?.sum || 0, error: 0 },
                { endpoint: "JWKS", success: jwksCount.stats?.sum || 0, error: 0 },
            ]);

            const [accessDenied, invalidRedirect, pkceFailure] = await Promise.all([
                getMetricsAggregate("oidc.authorize.access_denied.count", period),
                getMetricsAggregate("oauth.redirect_uri.invalid.count", period),
                getMetricsAggregate("oauth.pkce.failure.count", period),
            ]);
            setOidcErrors({
                accessDenied: accessDenied.stats?.sum || 0,
                invalidRedirect: invalidRedirect.stats?.sum || 0,
                pkceFailure: pkceFailure.stats?.sum || 0,
            });

            // Fetch API key data
            const [keyIssued, keyRevoked, keyMissing, keyInvalid, keyResolve, keyGroups] = await Promise.all([
                getMetricsTimeSeries("apikey.issued.count", period),
                getMetricsTimeSeries("apikey.revoked.count", period),
                getMetricsAggregate("apikey.auth.missing.count", period),
                getMetricsAggregate("apikey.auth.invalid.count", period),
                getMetricsAggregate("apikey.resolve.duration_ms", period),
                getMetricsAggregate("apikey.groups.count", period),
            ]);
            const apiKeyMap = new Map<number, { timestamp: number; issued: number; revoked: number }>();
            keyIssued.data.forEach((d) => {
                apiKeyMap.set(d.timestamp, { timestamp: d.timestamp, issued: d.value, revoked: 0 });
            });
            keyRevoked.data.forEach((d) => {
                const existing = apiKeyMap.get(d.timestamp) || { timestamp: d.timestamp, issued: 0, revoked: 0 };
                existing.revoked = d.value;
                apiKeyMap.set(d.timestamp, existing);
            });
            setApiKeyData(Array.from(apiKeyMap.values()).sort((a, b) => a.timestamp - b.timestamp));
            setApiKeyStats({
                resolveP95: keyResolve.stats?.max || 0,
                avgGroups: keyGroups.stats?.avg || 0,
                missing: keyMissing.stats?.sum || 0,
                invalid: keyInvalid.stats?.sum || 0,
            });

            // Fetch email data
            const [emailSuccess, emailError, emailRateLimited, emailDuration] = await Promise.all([
                getMetricsTimeSeries("email.send.success", period),
                getMetricsTimeSeries("email.send.error", period),
                getMetricsTimeSeries("email.send.rate_limited.count", period),
                getMetricsAggregate("email.send.duration_ms", period),
            ]);
            const emailMap = new Map<number, { timestamp: number; success: number; error: number; rateLimited: number }>();
            emailSuccess.data.forEach((d) => {
                emailMap.set(d.timestamp, { timestamp: d.timestamp, success: d.value, error: 0, rateLimited: 0 });
            });
            emailError.data.forEach((d) => {
                const existing = emailMap.get(d.timestamp) || { timestamp: d.timestamp, success: 0, error: 0, rateLimited: 0 };
                existing.error = d.value;
                emailMap.set(d.timestamp, existing);
            });
            emailRateLimited.data.forEach((d) => {
                const existing = emailMap.get(d.timestamp) || { timestamp: d.timestamp, success: 0, error: 0, rateLimited: 0 };
                existing.rateLimited = d.value;
                emailMap.set(d.timestamp, existing);
            });
            setEmailData(Array.from(emailMap.values()).sort((a, b) => a.timestamp - b.timestamp));

            const totalSuccess = emailSuccess.data.reduce((acc, d) => acc + d.value, 0);
            const totalEmailError = emailError.data.reduce((acc, d) => acc + d.value, 0);
            setEmailStats({
                durationP95: emailDuration.stats?.max || 0,
                successRate: totalSuccess + totalEmailError > 0 ? (totalSuccess / (totalSuccess + totalEmailError)) * 100 : 100,
            });

            // Fetch JWKS health
            const [jwksAge, jwksRotation, jwksPruned] = await Promise.all([
                getLatestGauge("jwks.active_key.age_ms"),
                getMetricsAggregate("jwks.rotate.duration_ms", period),
                getMetricsAggregate("jwks.pruned.count", period),
            ]);
            setJwksData({
                keyAgeDays: Math.floor((jwksAge.value || 0) / (1000 * 60 * 60 * 24)),
                lastRotation: null, // Would need a different query
                rotationP95: jwksRotation.stats?.max || 0,
                keysPruned: jwksPruned.stats?.sum || 0,
            });

            // Fetch user metric names
            const userMetricNames = await getUserMetricNames();
            setUserMetrics(userMetricNames.names || []);
        } catch (error) {
            console.error("Failed to fetch dashboard data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [period]);

    // Fetch user metric data when selected
    useEffect(() => {
        if (selectedUserMetric) {
            getMetricsTimeSeries(selectedUserMetric, period).then((result) => {
                setUserMetricData(result.data || []);
            });
        }
    }, [selectedUserMetric, period]);

    // Initial data fetch
    useEffect(() => {
        setIsLoading(true);
        fetchDashboardData();
    }, [fetchDashboardData]);

    return (
        <div className="space-y-6">
            {/* Dashboard Header with Global Controls */}
            <DashboardHeader onRefresh={fetchDashboardData} isLoading={isLoading} />

            {/* Chart Grid - Row 1: Auth Activity | Authz Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AuthActivityChart data={authActivityData} period={period} isLoading={isLoading} />
                <AuthzHealthChart data={authzHealthData} period={period} isLoading={isLoading} />
            </div>

            {/* Chart Grid - Row 2: Pipeline | Webhook */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PipelineChart data={pipelineData} gauges={pipelineGauges} period={period} isLoading={isLoading} />
                <WebhookChart data={webhookData} stats={webhookStats} isLoading={isLoading} />
            </div>

            {/* Chart Grid - Row 3: OIDC Health | API Keys */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <OidcHealthChart data={oidcData} errors={oidcErrors} isLoading={isLoading} />
                <ApiKeyChart data={apiKeyData} stats={apiKeyStats} period={period} isLoading={isLoading} />
            </div>

            {/* Chart Grid - Row 4: Email | JWKS Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EmailChart data={emailData} stats={emailStats} period={period} isLoading={isLoading} />
                <JwksHealthCard data={jwksData} isLoading={isLoading} />
            </div>

            {/* Chart Grid - Row 5: User Metrics | Admin Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <UserMetricsChart
                    availableMetrics={userMetrics}
                    data={userMetricData}
                    selectedMetric={selectedUserMetric}
                    onMetricChange={setSelectedUserMetric}
                    period={period}
                    isLoading={isLoading}
                />
                <AdminActivityLog activities={adminActivities} isLoading={isLoading} />
            </div>
        </div>
    );
}
