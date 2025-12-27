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

interface PipelineChartProps {
    data: {
        timestamp: number;
        p50: number;
        p95: number;
    }[];
    gauges: {
        poolActive: number | null;
        poolWaiting: number | null;
        poolExhausted: number;
    };
    period: string;
    isLoading?: boolean;
}

/**
 * Panel C: Pipeline Executions
 * LineChart showing latency percentiles with inline stat cards
 */
export function PipelineChart({ data, gauges, period, isLoading }: PipelineChartProps) {
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
                    <h3 className="text-lg font-semibold text-white">Pipeline Executions</h3>

                    {/* Inline stat badges */}
                    <div className="flex items-center gap-3 text-sm">
                        <span className="px-2 py-1 rounded bg-white/5 text-gray-300">
                            Active: <span className="text-white font-medium">{gauges.poolActive ?? 0}</span>
                        </span>
                        <span className={`px-2 py-1 rounded ${(gauges.poolWaiting ?? 0) > 0 ? "bg-yellow-500/20 text-yellow-300" : "bg-white/5 text-gray-300"
                            }`}>
                            Waiting: <span className="font-medium">{gauges.poolWaiting ?? 0}</span>
                        </span>
                        <span className={`px-2 py-1 rounded ${gauges.poolExhausted > 0 ? "bg-red-500/20 text-red-300" : "bg-white/5 text-gray-300"
                            }`}>
                            Exhausted: <span className="font-medium">{gauges.poolExhausted}</span>
                        </span>
                    </div>
                </div>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                        No pipeline data available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
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
                                unit="ms"
                            />
                            <Tooltip
                                contentStyle={CHART_STYLES.tooltip.contentStyle}
                                labelFormatter={(value) => new Date(value).toLocaleString()}
                                formatter={(value: number) => [`${value.toFixed(1)}ms`, ""]}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="p50"
                                name="P50 Latency"
                                stroke={CHART_COLORS.primary}
                                strokeWidth={2}
                                dot={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="p95"
                                name="P95 Latency"
                                stroke={CHART_COLORS.warning}
                                strokeWidth={2}
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
