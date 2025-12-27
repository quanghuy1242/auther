"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import { CHART_COLORS, CHART_STYLES } from "./chart-constants";

interface UserMetricsChartProps {
    availableMetrics: string[];
    data: {
        timestamp: number;
        value: number;
    }[];
    selectedMetric: string | null;
    onMetricChange: (metric: string) => void;
    period: string;
    isLoading?: boolean;
}

/**
 * Panel J: User-Defined Metrics
 * Dynamic chart for custom metrics from Lua scripts (helpers.metrics.*)
 */
export function UserMetricsChart({
    availableMetrics,
    data,
    selectedMetric,
    onMetricChange,
    period,
    isLoading,
}: UserMetricsChartProps) {
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
    const hasMetrics = availableMetrics.length > 0;

    const metricOptions = availableMetrics.map((name) => ({
        value: name,
        label: name.replace("user.", ""),
    }));

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">User-Defined Metrics</h3>

                    {hasMetrics && (
                        <Select
                            options={metricOptions}
                            value={selectedMetric || ""}
                            onChange={onMetricChange}
                            placeholder="Select a metric..."
                            triggerClassName="w-48"
                        />
                    )}
                </div>

                {isLoading ? (
                    <div className="h-[250px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : !hasMetrics ? (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                        <div className="text-center">
                            <p className="mb-2">No user metrics available</p>
                            <p className="text-xs">
                                Emit custom metrics using <code className="bg-white/10 px-1 rounded">helpers.metrics.count()</code> or <code className="bg-white/10 px-1 rounded">helpers.metrics.gauge()</code> in your Lua scripts.
                            </p>
                        </div>
                    </div>
                ) : !selectedMetric ? (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                        Select a metric to display
                    </div>
                ) : isEmpty ? (
                    <div className="h-[250px] flex items-center justify-center text-gray-400">
                        No data for selected metric
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={250}>
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
                            <Line
                                type="monotone"
                                dataKey="value"
                                name={selectedMetric}
                                stroke={CHART_COLORS.primary}
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
