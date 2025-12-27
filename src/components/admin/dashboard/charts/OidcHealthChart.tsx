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

interface OidcHealthChartProps {
    data: {
        endpoint: string;
        success: number;
        error: number;
    }[];
    errors?: {
        accessDenied: number;
        invalidRedirect: number;
        pkceFailure: number;
    };
    isLoading?: boolean;
}

/**
 * Panel E: OIDC & OAuth Health
 * Horizontal BarChart grouped by endpoint
 */
export function OidcHealthChart({ data, errors, isLoading }: OidcHealthChartProps) {
    const isEmpty = !data || data.length === 0;
    const hasErrors = errors && (errors.accessDenied > 0 || errors.invalidRedirect > 0 || errors.pkceFailure > 0);

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-white mb-4">OIDC & OAuth Health</h3>

                {isLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                        <div className="animate-pulse text-gray-400">Loading...</div>
                    </div>
                ) : isEmpty ? (
                    <div className="h-[300px] flex items-center justify-center text-gray-400">
                        No OIDC data available
                    </div>
                ) : (
                    <>
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={data} layout="vertical">
                                <XAxis type="number" stroke={CHART_STYLES.axis.stroke} tick={CHART_STYLES.axis.tick} />
                                <YAxis
                                    type="category"
                                    dataKey="endpoint"
                                    stroke={CHART_STYLES.axis.stroke}
                                    tick={CHART_STYLES.axis.tick}
                                    width={80}
                                />
                                <Tooltip contentStyle={CHART_STYLES.tooltip.contentStyle} />
                                <Legend />
                                <Bar dataKey="success" name="Success" fill={CHART_COLORS.success} radius={[0, 4, 4, 0]} />
                                <Bar dataKey="error" name="Error" fill={CHART_COLORS.error} radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>

                        {/* Error breakdown */}
                        {hasErrors && (
                            <div className="mt-4 pt-4 border-t border-gray-700">
                                <div className="text-sm font-medium text-gray-400 mb-2">Error Breakdown</div>
                                <div className="grid grid-cols-3 gap-3">
                                    {errors.accessDenied > 0 && (
                                        <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                                            <div className="text-xs text-gray-400">Access Denied</div>
                                            <div className="text-lg font-semibold text-red-400">{errors.accessDenied}</div>
                                        </div>
                                    )}
                                    {errors.invalidRedirect > 0 && (
                                        <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                                            <div className="text-xs text-gray-400">Invalid Redirect</div>
                                            <div className="text-lg font-semibold text-red-400">{errors.invalidRedirect}</div>
                                        </div>
                                    )}
                                    {errors.pkceFailure > 0 && (
                                        <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                                            <div className="text-xs text-gray-400">PKCE Failure</div>
                                            <div className="text-lg font-semibold text-red-400">{errors.pkceFailure}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
