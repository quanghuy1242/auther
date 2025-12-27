"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { CHART_COLORS, CHART_STYLES } from "./chart-constants";

interface AuthzHealthChartProps {
    data: {
        timestamp: number;
        allowed: number;
        denied: number;
        errors: number;
    }[];
    period: string;
    isLoading?: boolean;
}

/**
 * Panel B: Authorization Health
 * Grouped BarChart showing authz decision outcomes
 */
export function AuthzHealthChart({ data, period, isLoading }: AuthzHealthChartProps) {
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
                <h3 className="text-lg font-semibold text-white mb-4">Authorization Health</h3>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                        No authorization data available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data}>
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
                            <Bar
                                dataKey="allowed"
                                name="Allowed"
                                fill={CHART_COLORS.success}
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="denied"
                                name="Denied"
                                fill={CHART_COLORS.warning}
                                radius={[4, 4, 0, 0]}
                            />
                            <Bar
                                dataKey="errors"
                                name="Errors"
                                fill={CHART_COLORS.error}
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
