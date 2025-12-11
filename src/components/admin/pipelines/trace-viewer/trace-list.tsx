"use client";

import { useState } from "react";
import { Badge, Button, EmptyState } from "@/components/ui";
import { SectionHeader } from "@/components/ui/section-header";
import type { TraceInfo, SpanInfo } from "@/app/admin/pipelines/actions";
import { getTraces, getTraceWithSpans } from "@/app/admin/pipelines/actions";
import { TraceFilters } from "./trace-filters";
import { TraceDetail } from "./trace-detail";

interface TraceListProps {
    initialTraces: TraceInfo[];
    triggerEvents: string[];
}

/**
 * Trace list component with filtering and detail view.
 */
export function TraceList({ initialTraces, triggerEvents }: TraceListProps) {
    const [traces, setTraces] = useState<TraceInfo[]>(initialTraces);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTrace, setSelectedTrace] = useState<TraceInfo | null>(null);
    const [selectedSpans, setSelectedSpans] = useState<SpanInfo[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // Handle filter changes
    const handleFilterChange = async (filters: {
        triggerEvent?: string;
        status?: string;
        from?: Date;
        to?: Date;
    }) => {
        setIsLoading(true);
        try {
            const result = await getTraces({
                triggerEvent: filters.triggerEvent || undefined,
                status: filters.status || undefined,
                from: filters.from,
                to: filters.to,
            });
            setTraces(result);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle refresh
    const handleRefresh = async () => {
        setIsLoading(true);
        try {
            const result = await getTraces();
            setTraces(result);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle trace click
    const handleTraceClick = async (trace: TraceInfo) => {
        setSelectedTrace(trace);
        setIsDetailOpen(true);
        // Fetch spans for the trace
        const result = await getTraceWithSpans(trace.id);
        setSelectedSpans(result.spans);
    };

    // Format duration
    const formatDuration = (ms: number | null) => {
        if (ms === null) return "—";
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    // Format relative time
    const formatRelativeTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    };

    // Get status badge variant
    const getStatusVariant = (status: string) => {
        switch (status) {
            case "success":
                return "success";
            case "blocked":
                return "warning";
            case "error":
                return "danger";
            default:
                return "default";
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <SectionHeader
                title="Pipeline Traces"
                description="Execution traces from pipeline script runs"
                action={
                    <Button
                        onClick={handleRefresh}
                        disabled={isLoading}
                        variant="secondary"
                        leftIcon="refresh"
                    >
                        Refresh
                    </Button>
                }
            />

            {/* Filters */}
            <TraceFilters
                triggerEvents={triggerEvents}
                onFilterChange={handleFilterChange}
                isLoading={isLoading}
            />

            {/* Trace table */}
            {traces.length === 0 ? (
                <div className="border border-slate-700 rounded-lg">
                    <EmptyState
                        icon="timeline"
                        title="No traces yet"
                        description="Pipeline execution traces will appear here when authentication flows run with configured scripts."
                    />
                </div>
            ) : (
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-800/50">
                            <tr>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">
                                    Trace ID
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">
                                    Trigger
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">
                                    Status
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">
                                    Duration
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">
                                    User
                                </th>
                                <th className="text-left px-4 py-3 text-sm font-medium text-slate-300">
                                    Time
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {traces.map((trace) => (
                                <tr
                                    key={trace.id}
                                    className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                                    onClick={() => handleTraceClick(trace)}
                                >
                                    <td className="px-4 py-3">
                                        <code className="text-xs text-blue-400 bg-slate-800 px-2 py-1 rounded">
                                            {trace.id.slice(0, 8)}...
                                        </code>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-300">
                                        {trace.triggerEvent.replace(/_/g, " ")}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={getStatusVariant(trace.status)}>
                                            {trace.status}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                                        {formatDuration(trace.durationMs)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-400">
                                        {trace.userId ? (
                                            <span className="truncate max-w-[120px] inline-block">
                                                {trace.userId.slice(0, 8)}...
                                            </span>
                                        ) : (
                                            <span className="text-slate-500">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-500">
                                        {formatRelativeTime(trace.startedAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Trace detail modal */}
            {selectedTrace && (
                <TraceDetail
                    isOpen={isDetailOpen}
                    onClose={() => {
                        setIsDetailOpen(false);
                        setSelectedTrace(null);
                        setSelectedSpans([]);
                    }}
                    trace={selectedTrace}
                    spans={selectedSpans}
                />
            )}
        </div>
    );
}
