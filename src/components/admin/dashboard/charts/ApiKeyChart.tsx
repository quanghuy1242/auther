"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { CHART_COLORS, CHART_STYLES } from "./chart-constants";

interface ApiKeyChartProps {
    data: {
        timestamp: number;
        issued: number;
        revoked: number;
    }[];
    stats: {
        resolveP95: number;
        avgGroups: number;
        missing: number;
        invalid: number;
    };
    period: string;
    isLoading?: boolean;
}

/**
 * Panel F: API Key Usage
 * LineChart with issued/revoked keys and stat cards
 */
export function ApiKeyChart({ data, stats, period, isLoading }: ApiKeyChartProps) {
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        if (period === "24h") {
            return date.toLocaleTimeString(undefined, { hour: "2-digit" });
        }
        if (period === "7d") {
            return date.toLocaleDateString(undefined, { weekday: "short" });
        }
        if (period === "30d") {
            return date.toLocaleDateString(undefined, { day: "numeric" });
        }
        return date.toLocaleDateString(undefined, { month: "short" });
    };

    const isEmpty = !data || data.length === 0;

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">API Key Usage</h3>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : (
                    <>
                        {/* Stats row */}
                        <div className="grid grid-cols-4 gap-3 mb-4">
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-xs text-gray-400">Resolve P95</div>
                                <div className="text-lg font-semibold text-white">{stats.resolveP95.toFixed(0)}ms</div>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-xs text-gray-400">Avg Groups</div>
                                <div className="text-lg font-semibold text-white">{stats.avgGroups.toFixed(1)}</div>
                            </div>
                            <div className={`p-3 rounded-lg ${stats.missing > 0 ? "bg-yellow-500/10" : "bg-white/5"}`}>
                                <div className="text-xs text-gray-400">Missing Auth</div>
                                <div className={`text-lg font-semibold ${stats.missing > 0 ? "text-yellow-400" : "text-white"}`}>
                                    {stats.missing}
                                </div>
                            </div>
                            <div className={`p-3 rounded-lg ${stats.invalid > 0 ? "bg-red-500/10" : "bg-white/5"}`}>
                                <div className="text-xs text-gray-400">Invalid Keys</div>
                                <div className={`text-lg font-semibold ${stats.invalid > 0 ? "text-red-400" : "text-white"}`}>
                                    {stats.invalid}
                                </div>
                            </div>
                        </div>

                        {/* Chart */}
                        {isEmpty ? (
                            <div className="h-[200px] flex items-center justify-center text-gray-400">
                                No API key data available
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={data}>
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={formatTime}
                                        stroke={CHART_STYLES.axis.stroke}
                                        tick={CHART_STYLES.axis.tick}
                                    />
                                    <YAxis
                                        stroke={CHART_STYLES.axis.stroke}
                                        tick={CHART_STYLES.axis.tick}
                                    />
                                    <Tooltip
                                        contentStyle={CHART_STYLES.tooltip.contentStyle}
                                        labelFormatter={(value) => new Date(value).toLocaleString()}
                                    />
                                    <Legend />
                                    <Line
                                        type="monotone"
                                        dataKey="issued"
                                        name="Keys Issued"
                                        stroke={CHART_COLORS.success}
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="revoked"
                                        name="Keys Revoked"
                                        stroke={CHART_COLORS.error}
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
