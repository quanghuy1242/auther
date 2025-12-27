"use client";

import { useCallback, useMemo } from "react";
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
import { useProgressiveLoad } from "./hooks/useProgressiveLoad";
import { useMetricsStream, type StreamedMetrics } from "./hooks/useMetricsStream";

interface DashboardChartsProps {
    initialPeriod?: Period;
}

/**
 * Client-side dashboard charts with:
 * - Batched API (36 queries → 1 request)
 * - Progressive loading (priority-based panel rendering)
 * - SSE streaming (real-time updates)
 */
export function DashboardCharts({ initialPeriod = "24h" }: DashboardChartsProps) {
    const searchParams = useSearchParams();
    const period = (searchParams.get("period") as Period) || initialPeriod;

    // Progressive loading with batched API
    const {
        data,
        loadingStates,
        isLoading,
        refresh,
        userMetricData,
        selectedUserMetric,
        setSelectedUserMetric,
    } = useProgressiveLoad({ period });

    // SSE streaming callback to merge streamed data
    const handleStreamUpdate = useCallback((streamedData: StreamedMetrics) => {
        // Stream data is used for real-time indicators
        // Full data comes from progressive load
        console.log("[SSE] Received update:", streamedData.timestamp);
    }, []);

    // SSE streaming for real-time updates
    const { isConnected: isStreamConnected } = useMetricsStream({
        period,
        enabled: true,
        onUpdate: handleStreamUpdate,
    });

    // Memoized chart data from batched response
    const authActivityData = useMemo(() => data?.authActivity || [], [data?.authActivity]);
    const authzHealthData = useMemo(() => data?.authzHealth || [], [data?.authzHealth]);
    const pipelineData = useMemo(() => data?.pipeline.timeSeries || [], [data?.pipeline.timeSeries]);
    const pipelineGauges = useMemo(() => data?.pipeline.gauges || { poolActive: null, poolWaiting: null, poolExhausted: 0 }, [data?.pipeline.gauges]);
    const webhookData = useMemo(() => data?.webhook.breakdown || { successful: 0, failed: 0 }, [data?.webhook.breakdown]);
    const webhookStats = useMemo(() => data?.webhook.stats || { emitP95: 0, deliveryP95: 0, total: 0 }, [data?.webhook.stats]);
    const oidcData = useMemo(() => data?.oidc.endpoints || [], [data?.oidc.endpoints]);
    const oidcErrors = useMemo(() => data?.oidc.errors || { accessDenied: 0, invalidRedirect: 0, pkceFailure: 0 }, [data?.oidc.errors]);
    const apiKeyData = useMemo(() => data?.apiKey.timeSeries || [], [data?.apiKey.timeSeries]);
    const apiKeyStats = useMemo(() => data?.apiKey.stats || { resolveP95: 0, avgGroups: 0, missing: 0, invalid: 0 }, [data?.apiKey.stats]);
    const emailData = useMemo(() => data?.email.timeSeries || [], [data?.email.timeSeries]);
    const emailStats = useMemo(() => data?.email.stats || { durationP95: 0, successRate: 100 }, [data?.email.stats]);
    const jwksData = useMemo(() => data?.jwks || { keyAgeDays: 0, lastRotation: null, rotationP95: 0, keysPruned: 0 }, [data?.jwks]);
    const userMetrics = useMemo(() => data?.userMetricNames || [], [data?.userMetricNames]);

    // Empty admin activities (would come from a different source)
    const adminActivities: { id: string; type: string; description: string; timestamp: Date }[] = [];

    return (
        <div className="space-y-6">
            {/* Dashboard Header with Global Controls */}
            <DashboardHeader
                onRefresh={refresh}
                isLoading={isLoading}
                isStreamConnected={isStreamConnected}
            />

            {/* Chart Grid - Row 1: Auth Activity | Authz Health (Critical - Tier 1) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AuthActivityChart
                    data={authActivityData}
                    period={period}
                    isLoading={loadingStates.authActivity}
                />
                <AuthzHealthChart
                    data={authzHealthData}
                    period={period}
                    isLoading={loadingStates.authzHealth}
                />
            </div>

            {/* Chart Grid - Row 2: Pipeline | Webhook (Important - Tier 2) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <PipelineChart
                    data={pipelineData}
                    gauges={pipelineGauges}
                    period={period}
                    isLoading={loadingStates.pipeline}
                />
                <WebhookChart
                    data={webhookData}
                    stats={webhookStats}
                    isLoading={loadingStates.webhook}
                />
            </div>

            {/* Chart Grid - Row 3: OIDC Health | API Keys (Supporting - Tier 3) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <OidcHealthChart
                    data={oidcData}
                    errors={oidcErrors}
                    isLoading={loadingStates.oidc}
                />
                <ApiKeyChart
                    data={apiKeyData}
                    stats={apiKeyStats}
                    period={period}
                    isLoading={loadingStates.apiKey}
                />
            </div>

            {/* Chart Grid - Row 4: Email | JWKS Health (Supporting - Tier 3) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <EmailChart
                    data={emailData}
                    stats={emailStats}
                    period={period}
                    isLoading={loadingStates.email}
                />
                <JwksHealthCard data={jwksData} isLoading={loadingStates.jwks} />
            </div>

            {/* Chart Grid - Row 5: User Metrics | Admin Activity (Supporting - Tier 3) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <UserMetricsChart
                    availableMetrics={userMetrics}
                    data={userMetricData}
                    selectedMetric={selectedUserMetric}
                    onMetricChange={setSelectedUserMetric}
                    period={period}
                    isLoading={loadingStates.userMetrics}
                />
                <AdminActivityLog activities={adminActivities} isLoading={isLoading} />
            </div>
        </div>
    );
}
