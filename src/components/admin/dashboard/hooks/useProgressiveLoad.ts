"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    getDashboardMetrics,
    getUserMetricTimeSeries,
    type Period,
    type DashboardMetricsResponse,
    type TimeSeriesPoint,
} from "@/app/admin/dashboard-metrics-batch";

// Priority tiers for progressive loading
export enum LoadingTier {
    CRITICAL = 1,  // Auth Activity, Authz Health
    IMPORTANT = 2, // Pipeline, Webhook
    SUPPORTING = 3, // OIDC, API Key, Email, JWKS, User Metrics
}

export interface PanelLoadingState {
    authActivity: boolean;
    authzHealth: boolean;
    pipeline: boolean;
    webhook: boolean;
    oidc: boolean;
    apiKey: boolean;
    email: boolean;
    jwks: boolean;
    userMetrics: boolean;
}

interface UseProgressiveLoadOptions {
    /** Time period for metrics */
    period: Period;
    /** Whether to initially load data */
    initialLoad?: boolean;
}

interface UseProgressiveLoadReturn {
    /** Current dashboard data */
    data: DashboardMetricsResponse | null;
    /** Per-panel loading states */
    loadingStates: PanelLoadingState;
    /** Overall loading state */
    isLoading: boolean;
    /** Whether any panel is loading */
    isAnyLoading: boolean;
    /** Trigger a full refresh */
    refresh: () => Promise<void>;
    /** User metric-specific data fetching */
    userMetricData: TimeSeriesPoint[];
    selectedUserMetric: string | null;
    setSelectedUserMetric: (name: string | null) => void;
}

const initialLoadingStates: PanelLoadingState = {
    authActivity: false,
    authzHealth: false,
    pipeline: false,
    webhook: false,
    oidc: false,
    apiKey: false,
    email: false,
    jwks: false,
    userMetrics: false,
};

/**
 * Hook for progressive loading of dashboard metrics.
 * 
 * Features:
 * - Single batched API call eliminates 36 network round-trips
 * - Stale-while-revalidate pattern shows cached data immediately
 * - Per-panel loading states for skeleton UI
 * - User metric selection with separate fetch
 */
export function useProgressiveLoad({
    period,
    initialLoad = true,
}: UseProgressiveLoadOptions): UseProgressiveLoadReturn {
    const [data, setData] = useState<DashboardMetricsResponse | null>(null);
    const [loadingStates, setLoadingStates] = useState<PanelLoadingState>(initialLoadingStates);
    const [isLoading, setIsLoading] = useState(false);
    const [userMetricData, setUserMetricData] = useState<TimeSeriesPoint[]>([]);
    const [selectedUserMetric, setSelectedUserMetric] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);
    const cachedDataRef = useRef<DashboardMetricsResponse | null>(null);

    // Check if any panel is loading
    const isAnyLoading = Object.values(loadingStates).some(Boolean) || isLoading;

    /**
     * Progressive loading with stale-while-revalidate:
     * 1. Show cached data immediately (if available)
     * 2. Set individual panel loading states
     * 3. Fetch fresh data from batched API
     * 4. Update panels progressively as data arrives
     */
    const refresh = useCallback(async () => {
        // Cancel any in-flight request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setIsLoading(true);

        // Stale-while-revalidate: show cached data but indicate refresh in progress
        if (cachedDataRef.current) {
            setData(cachedDataRef.current);
        }

        // Set all panels to loading state (progressively)
        // Tier 1 panels load first
        setLoadingStates({
            authActivity: true,
            authzHealth: true,
            pipeline: true,
            webhook: true,
            oidc: true,
            apiKey: true,
            email: true,
            jwks: true,
            userMetrics: true,
        });

        try {
            // Single batched fetch - all 36 queries run in parallel on server
            const result = await getDashboardMetrics(period);

            if (result.success) {
                // Progressive update: Critical panels first (Tier 1)
                setLoadingStates(prev => ({
                    ...prev,
                    authActivity: false,
                    authzHealth: false,
                }));

                // Small delay to create visual progression effect
                await new Promise(resolve => setTimeout(resolve, 50));

                // Important panels next (Tier 2)
                setLoadingStates(prev => ({
                    ...prev,
                    pipeline: false,
                    webhook: false,
                }));

                await new Promise(resolve => setTimeout(resolve, 50));

                // Supporting panels last (Tier 3)
                setLoadingStates(prev => ({
                    ...prev,
                    oidc: false,
                    apiKey: false,
                    email: false,
                    jwks: false,
                    userMetrics: false,
                }));

                setData(result);
                cachedDataRef.current = result;
            }
        } catch (error) {
            if ((error as Error).name !== "AbortError") {
                console.error("Failed to fetch dashboard metrics:", error);
            }
        } finally {
            setIsLoading(false);
            setLoadingStates(initialLoadingStates);
        }
    }, [period]);

    // Fetch user metric data when metric selection changes
    useEffect(() => {
        if (!selectedUserMetric) {
            setUserMetricData([]);
            return;
        }

        let cancelled = false;

        setLoadingStates(prev => ({ ...prev, userMetrics: true }));

        getUserMetricTimeSeries(selectedUserMetric, period).then(result => {
            if (!cancelled && result.success) {
                setUserMetricData(result.data);
            }
            setLoadingStates(prev => ({ ...prev, userMetrics: false }));
        });

        return () => {
            cancelled = true;
        };
    }, [selectedUserMetric, period]);

    // Initial load and period change trigger
    useEffect(() => {
        if (initialLoad) {
            refresh();
        }

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [initialLoad, refresh]);

    return {
        data,
        loadingStates,
        isLoading,
        isAnyLoading,
        refresh,
        userMetricData,
        selectedUserMetric,
        setSelectedUserMetric,
    };
}
