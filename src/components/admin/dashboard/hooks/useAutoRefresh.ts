"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseAutoRefreshOptions {
    /** Refresh interval in milliseconds (default: 15000ms = 15 seconds) */
    intervalMs?: number;
    /** Whether auto-refresh is enabled by default */
    defaultEnabled?: boolean;
    /** Callback to execute on each refresh */
    onRefresh: () => void | Promise<void>;
}

interface UseAutoRefreshReturn {
    /** Whether auto-refresh is currently enabled */
    isEnabled: boolean;
    /** Toggle auto-refresh on/off */
    toggleEnabled: () => void;
    /** Whether currently refreshing */
    isRefreshing: boolean;
    /** Manually trigger a refresh */
    refresh: () => Promise<void>;
    /** Time until next refresh (in seconds), null if disabled */
    nextRefreshIn: number | null;
}

/**
 * Hook for auto-refreshing dashboard data
 * - Auto-refresh every 15 seconds when tab is active
 * - Pauses when tab is hidden (visibilitychange)
 * - Manual refresh button with loading state
 * - Toggle to disable auto-refresh
 */
export function useAutoRefresh({
    intervalMs = 15000,
    defaultEnabled = true,
    onRefresh,
}: UseAutoRefreshOptions): UseAutoRefreshReturn {
    const [isEnabled, setIsEnabled] = useState(defaultEnabled);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [nextRefreshIn, setNextRefreshIn] = useState<number | null>(
        defaultEnabled ? intervalMs / 1000 : null
    );

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);
    const lastRefreshRef = useRef<number>(Date.now());

    const refresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await onRefresh();
            lastRefreshRef.current = Date.now();
        } finally {
            setIsRefreshing(false);
        }
    }, [onRefresh]);

    const toggleEnabled = useCallback(() => {
        setIsEnabled((prev) => !prev);
    }, []);

    // Handle visibility change - pause when tab is hidden
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible" && isEnabled) {
                // Tab became visible - check if we need to refresh
                const elapsed = Date.now() - lastRefreshRef.current;
                if (elapsed >= intervalMs) {
                    refresh();
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isEnabled, intervalMs, refresh]);

    // Main refresh interval
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (isEnabled && document.visibilityState === "visible") {
            intervalRef.current = setInterval(() => {
                if (document.visibilityState === "visible") {
                    refresh();
                }
            }, intervalMs);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [isEnabled, intervalMs, refresh]);

    // Countdown timer
    useEffect(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }

        if (isEnabled) {
            setNextRefreshIn(intervalMs / 1000);

            countdownRef.current = setInterval(() => {
                const elapsed = Date.now() - lastRefreshRef.current;
                const remaining = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000));
                setNextRefreshIn(remaining);
            }, 1000);
        } else {
            setNextRefreshIn(null);
        }

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
            }
        };
    }, [isEnabled, intervalMs]);

    return {
        isEnabled,
        toggleEnabled,
        isRefreshing,
        refresh,
        nextRefreshIn,
    };
}
