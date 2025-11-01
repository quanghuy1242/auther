"use client";

import { Card, CardContent } from "./card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

interface MetricsCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: number;
    label: string;
  };
  chartData: {
    label: string;
    value: number;
    successRate?: number;
  }[];
  chartColor?: string;
  className?: string;
}

export function MetricsCard({
  title,
  value,
  trend,
  chartData,
  chartColor = "#1773cf",
  className = "",
}: MetricsCardProps) {
  const trendColor = trend && trend.value >= 0 ? "text-green-500" : "text-red-500";
  const trendIcon = trend && trend.value >= 0 ? "+" : "";

  return (
    <Card className={className}>
      <CardContent>
        <div className="space-y-4">
          {/* Header with metric value */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">{title}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-[var(--color-text-primary)]">
                  {value}
                </span>
                {trend && (
                  <span className={`text-sm font-medium ${trendColor}`}>
                    {trendIcon}
                    {trend.value}%
                  </span>
                )}
              </div>
              {trend && (
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{trend.label}</p>
              )}
            </div>
          </div>

          {/* Bar Chart */}
          <div className="h-32 sm:h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <XAxis
                  dataKey="label"
                  stroke="#ffffff"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#ffffff"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-content)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                    fontSize: "14px",
                  }}
                  cursor={{ fill: "rgba(23, 115, 207, 0.1)" }}
                  formatter={(value: number, name: string, props: { payload?: { successRate?: number } }) => {
                    if (props.payload?.successRate !== undefined) {
                      return [
                        `${value} deliveries (${props.payload.successRate}% success)`,
                        "Total",
                      ];
                    }
                    return [value, name];
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={chartColor}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={60}
                  opacity={0.9}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
