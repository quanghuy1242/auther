"use client";

import { useState, useCallback, useTransition } from "react";

export type Period = "24h" | "7d" | "30d" | "12mo";

export interface TimeSeriesPoint {
    timestamp: number;
    value: number;
}

export interface AggregateStats {
    sum: number;
    avg: number;
    count: number;
    min: number;
    max: number;
}

export interface UseMetricsQueryOptions<T> {
    /** Function to fetch the data */
    queryFn: (period: Period) => Promise<T>;
    /** Initial data (from server-side render) */
    initialData?: T;
    /** Initial period */
    initialPeriod?: Period;
}

interface UseMetricsQueryReturn<T> {
    /** Current data */
    data: T | undefined;
    /** Whether currently loading */
    isLoading: boolean;
    /** Error if any */
    error: Error | null;
    /** Current period selection */
    period: Period;
    /** Change the period */
    setPeriod: (period: Period) => void;
    /** Manually refetch data */
    refetch: () => Promise<void>;
}

/**
 * Get time range and interval based on period selection
 */
export function getPeriodConfig(period: Period): {
    from: Date;
    to: Date;
    intervalSeconds: number;
    label: string;
} {
    const now = new Date();
    const to = now;
    let from: Date;
    let intervalSeconds: number;
    let label: string;

    switch (period) {
        case "24h":
            from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            intervalSeconds = 3600; // 1 hour buckets
            label = "Last 24 Hours";
            break;
        case "7d":
            from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            intervalSeconds = 6 * 3600; // 6 hour buckets
            label = "Last 7 Days";
            break;
        case "30d":
            from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            intervalSeconds = 24 * 3600; // 1 day buckets
            label = "Last 30 Days";
            break;
        case "12mo":
            from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            intervalSeconds = 30 * 24 * 3600; // ~1 month buckets
            label = "Last 12 Months";
            break;
    }

    return { from, to, intervalSeconds, label };
}

/**
 * Hook for fetching metrics data with period selection
 */
export function useMetricsQuery<T>({
    queryFn,
    initialData,
    initialPeriod = "24h",
}: UseMetricsQueryOptions<T>): UseMetricsQueryReturn<T> {
    const [data, setData] = useState<T | undefined>(initialData);
    const [error, setError] = useState<Error | null>(null);
    const [period, setPeriodState] = useState<Period>(initialPeriod);
    const [isPending, startTransition] = useTransition();

    const fetchData = useCallback(
        async (p: Period) => {
            try {
                setError(null);
                const result = await queryFn(p);
                setData(result);
            } catch (err) {
                setError(err instanceof Error ? err : new Error("Failed to fetch metrics"));
            }
        },
        [queryFn]
    );

    const setPeriod = useCallback(
        (newPeriod: Period) => {
            setPeriodState(newPeriod);
            startTransition(() => {
                fetchData(newPeriod);
            });
        },
        [fetchData]
    );

    const refetch = useCallback(async () => {
        await fetchData(period);
    }, [fetchData, period]);

    return {
        data,
        isLoading: isPending,
        error,
        period,
        setPeriod,
        refetch,
    };
}

/**
 * Format timestamp for chart display based on period
 */
export function formatChartTimestamp(timestamp: number, period: Period): string {
    const date = new Date(timestamp);

    switch (period) {
        case "24h":
            return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        case "7d":
            return date.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit" });
        case "30d":
            return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        case "12mo":
            return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    }
}
