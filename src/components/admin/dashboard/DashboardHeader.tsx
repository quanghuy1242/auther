"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { useAutoRefresh } from "./hooks/useAutoRefresh";

export type Period = "24h" | "7d" | "30d" | "12mo";

interface DashboardHeaderProps {
    /** Callback when data should be refreshed */
    onRefresh: () => void | Promise<void>;
    /** Whether data is currently loading */
    isLoading?: boolean;
    /** Whether SSE stream is connected */
    isStreamConnected?: boolean;
}

const PERIOD_OPTIONS = [
    { value: "24h", label: "Last 24 Hours" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
    { value: "12mo", label: "Last 12 Months" },
];

/**
 * Dashboard header with global controls
 * - Period selector (stored in URL for shareability)
 * - Auto-refresh toggle (15s interval, pauses when tab hidden)
 * - Manual refresh button
 */
export function DashboardHeader({ onRefresh, isLoading = false, isStreamConnected = false }: DashboardHeaderProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Get period from URL search params, default to 24h
    const period = (searchParams.get("period") as Period) || "24h";

    // Auto-refresh hook
    const { isEnabled, toggleEnabled, isRefreshing, refresh, nextRefreshIn } = useAutoRefresh({
        intervalMs: 15000, // 15 seconds as per spec
        defaultEnabled: true,
        onRefresh,
    });

    // Handle period change - update URL search params
    const handlePeriodChange = useCallback(
        (newPeriod: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("period", newPeriod);
            router.push(`?${params.toString()}`, { scroll: false });
        },
        [router, searchParams]
    );

    // Manual refresh handler
    const handleManualRefresh = useCallback(async () => {
        await refresh();
    }, [refresh]);

    const showLoading = isLoading || isRefreshing;

    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            {/* Period Selector */}
            <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">Period:</span>
                <Select
                    options={PERIOD_OPTIONS}
                    value={period}
                    onChange={handlePeriodChange}
                    triggerClassName="w-40"
                />
            </div>

            {/* Live Indicator + Refresh Controls */}
            <div className="flex items-center gap-4">
                {/* Live streaming indicator */}
                {isStreamConnected && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/20 rounded-full">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-green-400">Live</span>
                    </div>
                )}
                {/* Auto-refresh toggle */}
                <div className="flex items-center gap-2">
                    <Switch
                        checked={isEnabled}
                        onChange={toggleEnabled}
                    />
                    <span className="text-sm text-gray-400 whitespace-nowrap">
                        Auto-refresh
                        {isEnabled && nextRefreshIn !== null && (
                            <span className="ml-1 text-gray-500">({nextRefreshIn}s)</span>
                        )}
                    </span>
                </div>

                {/* Manual refresh button */}
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleManualRefresh}
                    disabled={showLoading}
                    className="flex items-center gap-2"
                >
                    <Icon
                        name="refresh"
                        size="sm"
                        className={showLoading ? "animate-spin" : ""}
                    />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>
        </div>
    );
}
