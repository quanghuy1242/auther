"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { CHART_COLORS, CHART_STYLES } from "./chart-constants";

interface EmailChartProps {
    data: {
        timestamp: number;
        success: number;
        error: number;
        rateLimited: number;
    }[];
    stats: {
        durationP95: number;
        successRate: number;
    };
    period: string;
    isLoading?: boolean;
}

/**
 * Panel G: Email Delivery
 * Stacked AreaChart showing email sending health
 */
export function EmailChart({ data, stats, period, isLoading }: EmailChartProps) {
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
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Email Delivery</h3>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="px-2 py-1 rounded bg-white/5 text-gray-300">
                            P95: <span className="text-white font-medium">{stats.durationP95.toFixed(0)}ms</span>
                        </span>
                        <span className={`px-2 py-1 rounded ${stats.successRate < 95 ? "bg-yellow-500/20 text-yellow-300" : "bg-green-500/20 text-green-300"
                            }`}>
                            Success: <span className="font-medium">{stats.successRate.toFixed(1)}%</span>
                        </span>
                    </div>
                </div>

                {isLoading ? (
                    <div className="h-[250px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                        No email data available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="emailSuccess" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="emailError" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.error} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.error} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="emailWarning" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0} />
                                </linearGradient>
                            </defs>
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
                            <Area
                                type="monotone"
                                dataKey="success"
                                name="Sent"
                                stackId="1"
                                stroke={CHART_COLORS.success}
                                fill="url(#emailSuccess)"
                            />
                            <Area
                                type="monotone"
                                dataKey="error"
                                name="Failed"
                                stackId="1"
                                stroke={CHART_COLORS.error}
                                fill="url(#emailError)"
                            />
                            <Area
                                type="monotone"
                                dataKey="rateLimited"
                                name="Rate Limited"
                                stackId="1"
                                stroke={CHART_COLORS.warning}
                                fill="url(#emailWarning)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
