"use client";

import { useState } from "react";
import { Button, Select } from "@/components/ui";

interface TraceFiltersProps {
    triggerEvents: string[];
    onFilterChange: (filters: {
        triggerEvent?: string;
        status?: string;
        from?: Date;
        to?: Date;
    }) => void;
    isLoading?: boolean;
}

const ALL_VALUE = "__all__";

const STATUS_OPTIONS = [
    { value: ALL_VALUE, label: "All statuses" },
    { value: "success", label: "Success" },
    { value: "blocked", label: "Blocked" },
    { value: "error", label: "Error" },
];

const TIME_RANGE_OPTIONS = [
    { value: "1h", label: "Last 1 hour" },
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: ALL_VALUE, label: "All time" },
];

/**
 * Filter controls for the trace list.
 */
export function TraceFilters({
    triggerEvents,
    onFilterChange,
    isLoading,
}: TraceFiltersProps) {
    const [triggerEvent, setTriggerEvent] = useState(ALL_VALUE);
    const [status, setStatus] = useState(ALL_VALUE);
    const [timeRange, setTimeRange] = useState("24h");

    // Calculate date range from preset
    const getDateRange = (range: string): { from?: Date; to?: Date } => {
        if (range === ALL_VALUE) return {};

        const now = new Date();
        const to = now;
        let from: Date;

        switch (range) {
            case "1h":
                from = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case "24h":
                from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case "7d":
                from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case "30d":
                from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                return {};
        }

        return { from, to };
    };

    const handleApply = () => {
        const dateRange = getDateRange(timeRange);
        onFilterChange({
            triggerEvent: triggerEvent === ALL_VALUE ? undefined : triggerEvent,
            status: status === ALL_VALUE ? undefined : status,
            ...dateRange,
        });
    };

    const handleClear = () => {
        setTriggerEvent(ALL_VALUE);
        setStatus(ALL_VALUE);
        setTimeRange("24h");
        onFilterChange({});
    };

    // Build trigger options
    const triggerOptions = [
        { value: ALL_VALUE, label: "All triggers" },
        ...triggerEvents.map((event) => ({
            value: event,
            label: event.replace(/_/g, " "),
        })),
    ];

    const hasFilters = triggerEvent !== ALL_VALUE || status !== ALL_VALUE || timeRange !== "24h";

    return (
        <div className="flex flex-wrap items-end gap-3">
            {/* Trigger dropdown */}
            <Select
                options={triggerOptions}
                value={triggerEvent}
                onChange={setTriggerEvent}
                placeholder="All triggers"
                disabled={isLoading}
                className="w-40"
                triggerClassName="py-1.5 text-sm"
            />

            {/* Status dropdown */}
            <Select
                options={STATUS_OPTIONS}
                value={status}
                onChange={setStatus}
                placeholder="All statuses"
                disabled={isLoading}
                className="w-36"
                triggerClassName="py-1.5 text-sm"
            />

            {/* Time range dropdown */}
            <Select
                options={TIME_RANGE_OPTIONS}
                value={timeRange}
                onChange={setTimeRange}
                placeholder="Time range"
                disabled={isLoading}
                className="w-40"
                triggerClassName="py-1.5 text-sm"
            />

            {/* Apply button */}
            <Button
                onClick={handleApply}
                disabled={isLoading}
                variant="secondary"
                size="sm"
            >
                Apply
            </Button>

            {/* Clear button */}
            {hasFilters && (
                <Button
                    onClick={handleClear}
                    disabled={isLoading}
                    variant="ghost"
                    size="sm"
                >
                    Clear
                </Button>
            )}
        </div>
    );
}
