// Chart color palette as per metrics_system_plan.md
export const CHART_COLORS = {
    success: "#22c55e",  // Green - Success/Allowed
    error: "#ef4444",    // Red - Error/Denied
    warning: "#eab308",  // Yellow - Warning
    primary: "#3b82f6",  // Blue - Primary/Info
    secondary: "#a855f7", // Purple - Secondary
    neutral: "#6b7280",  // Gray - Neutral
} as const;

// Extended palette for multi-series charts
export const CHART_SERIES_COLORS = [
    "#3b82f6", // Blue
    "#22c55e", // Green
    "#a855f7", // Purple
    "#f59e0b", // Amber
    "#06b6d4", // Cyan
    "#ec4899", // Pink
    "#84cc16", // Lime
    "#f97316", // Orange
] as const;

// Common chart styling
export const CHART_STYLES = {
    tooltip: {
        contentStyle: {
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
            color: "#f3f4f6",
        },
        labelStyle: {
            color: "#9ca3af",
        },
    },
    axis: {
        stroke: "#4b5563",
        tick: { fill: "#9ca3af", fontSize: 12 },
    },
    grid: {
        stroke: "#374151",
        strokeDasharray: "3 3",
    },
} as const;
