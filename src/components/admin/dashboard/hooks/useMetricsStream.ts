"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Period } from "@/app/admin/dashboard-metrics-batch";

export interface StreamedMetrics {
    timestamp: number;
    authActivity: {
        successfulLogins: number;
        failedLogins: number;
    };
    authzHealth: {
        allowed: number;
        denied: number;
    };
    pipeline: {
        poolActive: number | null;
        poolWaiting: number | null;
    };
    webhook: {
        successful: number;
        failed: number;
    };
}

interface UseMetricsStreamOptions {
    period: Period;
    enabled?: boolean;
    onUpdate?: (data: StreamedMetrics) => void;
}

interface UseMetricsStreamReturn {
    /** Whether SSE is connected */
    isConnected: boolean;
    /** Latest streamed data */
    data: StreamedMetrics | null;
    /** Error message if connection failed */
    error: string | null;
    /** Manually reconnect */
    reconnect: () => void;
    /** Disconnect from stream */
    disconnect: () => void;
}

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 second

/**
 * Hook for real-time metrics streaming via SSE.
 * 
 * Features:
 * - Connects to SSE endpoint for live updates
 * - Auto-reconnect with exponential backoff
 * - Proper cleanup on unmount
 * - Pause when tab is hidden
 */
export function useMetricsStream({
    period,
    enabled = true,
    onUpdate,
}: UseMetricsStreamOptions): UseMetricsStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [data, setData] = useState<StreamedMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);

    const eventSourceRef = useRef<EventSource | null>(null);
    const retryCountRef = useRef(0);
    const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const enabledRef = useRef(enabled);
    const onUpdateRef = useRef(onUpdate);
    const periodRef = useRef(period);

    // Keep refs in sync
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        onUpdateRef.current = onUpdate;
    }, [onUpdate]);

    useEffect(() => {
        periodRef.current = period;
    }, [period]);

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
        setIsConnected(false);
    }, []);

    // Use ref to avoid circular dependency in onerror handler
    const connectRef = useRef<() => void>(() => { });

    const connect = useCallback(() => {
        if (!enabledRef.current) return;

        // Disconnect existing connection
        disconnect();

        const url = `/api/admin/metrics/stream?period=${periodRef.current}`;
        const eventSource = new EventSource(url);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setIsConnected(true);
            setError(null);
            retryCountRef.current = 0;
        };

        eventSource.onmessage = (event) => {
            try {
                const parsedData = JSON.parse(event.data) as StreamedMetrics;
                setData(parsedData);
                onUpdateRef.current?.(parsedData);
            } catch (e) {
                console.error("Failed to parse SSE data:", e);
            }
        };

        eventSource.onerror = () => {
            setIsConnected(false);
            eventSource.close();
            eventSourceRef.current = null;

            // Reconnect with exponential backoff
            if (retryCountRef.current < MAX_RETRIES && enabledRef.current) {
                const delay = BASE_RETRY_DELAY * Math.pow(2, retryCountRef.current);
                retryCountRef.current++;
                setError(`Connection lost. Retrying in ${delay / 1000}s...`);

                retryTimeoutRef.current = setTimeout(() => {
                    if (enabledRef.current) {
                        connectRef.current();
                    }
                }, delay);
            } else if (retryCountRef.current >= MAX_RETRIES) {
                setError("Connection failed after maximum retries. Click to reconnect.");
            }
        };
    }, [disconnect]);

    // Keep connectRef in sync
    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    const reconnect = useCallback(() => {
        retryCountRef.current = 0;
        setError(null);
        connect();
    }, [connect]);

    // Handle visibility changes - pause when tab is hidden
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                disconnect();
            } else if (document.visibilityState === "visible" && enabledRef.current) {
                connectRef.current();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [disconnect]);

    // Connect/disconnect based on enabled state
    useEffect(() => {
        if (enabled) {
            connect();
        } else {
            disconnect();
        }

        return () => {
            disconnect();
        };
    }, [enabled, connect, disconnect]);

    // Reconnect when period changes
    useEffect(() => {
        if (enabled && isConnected) {
            connect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [period]);

    return {
        isConnected,
        data,
        error,
        reconnect,
        disconnect,
    };
}
