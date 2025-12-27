"use client";

import { Card, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { CHART_COLORS, CHART_STYLES } from "./chart-constants";

interface WebhookChartProps {
    data: {
        successful: number;
        failed: number;
    };
    stats: {
        emitP95: number;
        deliveryP95: number;
        total: number;
    };
    isLoading?: boolean;
}

/**
 * Panel D: Webhook Reliability
 * DonutChart showing success/failure rate with inline stats
 */
export function WebhookChart({ data, stats, isLoading }: WebhookChartProps) {
    const chartData = [
        { name: "Successful", value: data.successful, color: CHART_COLORS.success },
        { name: "Failed", value: data.failed, color: CHART_COLORS.error },
    ].filter((d) => d.value > 0);

    const isEmpty = data.successful === 0 && data.failed === 0;
    const successRate = data.successful + data.failed > 0
        ? ((data.successful / (data.successful + data.failed)) * 100).toFixed(1)
        : "0";

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">Webhook Reliability</h3>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                        No webhook data available
                    </div>
                ) : (
                    <div className="flex items-center gap-6">
                        {/* Donut Chart */}
                        <div className="flex-1">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="text-center text-2xl font-bold text-white">
                                {successRate}%
                                <span className="text-sm font-normal text-gray-400 ml-2">success rate</span>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="flex flex-col gap-3 min-w-[160px]">
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-sm text-gray-400">Total Webhooks</div>
                                <div className="text-xl font-semibold text-white">{stats.total.toLocaleString()}</div>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-sm text-gray-400">Emit P95</div>
                                <div className="text-xl font-semibold text-white">{stats.emitP95.toFixed(0)}ms</div>
                            </div>
                            <div className="p-3 rounded-lg bg-white/5">
                                <div className="text-sm text-gray-400">Delivery P95</div>
                                <div className="text-xl font-semibold text-white">{stats.deliveryP95.toFixed(0)}ms</div>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
