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

interface AuthActivityChartProps {
    data: {
        timestamp: number;
        successfulLogins: number;
        failedLogins: number;
        registrations: number;
        sessionsCreated: number;
    }[];
    period: string;
    isLoading?: boolean;
}

/**
 * Panel A: Authentication Activity
 * Stacked AreaChart showing auth volume and success/failure trends
 */
export function AuthActivityChart({ data, period, isLoading }: AuthActivityChartProps) {
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        if (period === "24h") {
            return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        }
        if (period === "7d") {
            return date.toLocaleDateString(undefined, { weekday: "short" });
        }
        if (period === "30d") {
            return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        }
        return date.toLocaleDateString(undefined, { month: "short" });
    };

    const isEmpty = !data || data.length === 0;

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Authentication Activity</h3>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                        No authentication data available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.error} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.error} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorSecondary" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0} />
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
                                dataKey="successfulLogins"
                                name="Successful Logins"
                                stackId="1"
                                stroke={CHART_COLORS.success}
                                fill="url(#colorSuccess)"
                            />
                            <Area
                                type="monotone"
                                dataKey="failedLogins"
                                name="Failed Logins"
                                stackId="1"
                                stroke={CHART_COLORS.error}
                                fill="url(#colorError)"
                            />
                            <Area
                                type="monotone"
                                dataKey="registrations"
                                name="New Registrations"
                                stackId="1"
                                stroke={CHART_COLORS.primary}
                                fill="url(#colorPrimary)"
                            />
                            <Area
                                type="monotone"
                                dataKey="sessionsCreated"
                                name="Sessions Created"
                                stackId="1"
                                stroke={CHART_COLORS.secondary}
                                fill="url(#colorSecondary)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
