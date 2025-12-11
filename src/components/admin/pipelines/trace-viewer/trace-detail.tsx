"use client";

import { useState } from "react";
import { Badge, Button, Icon } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import type { TraceInfo, SpanInfo } from "@/app/admin/pipelines/actions";

interface TraceDetailProps {
    isOpen: boolean;
    onClose: () => void;
    trace: TraceInfo;
    spans: SpanInfo[];
}

/**
 * Extended span with tree structure for nested visualization.
 */
interface SpanNode extends SpanInfo {
    children: SpanNode[];
    depth: number;
}

/**
 * Build a tree structure from flat spans based on parentSpanId.
 */
function buildSpanTree(spans: SpanInfo[]): SpanNode[] {
    const spanMap = new Map<string, SpanNode>();
    const rootSpans: SpanNode[] = [];

    // First pass: create SpanNode for each span
    for (const span of spans) {
        spanMap.set(span.id, { ...span, children: [], depth: 0 });
    }

    // Second pass: build parent-child relationships
    for (const span of spans) {
        const node = spanMap.get(span.id)!;
        if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
            const parent = spanMap.get(span.parentSpanId)!;
            parent.children.push(node);
            node.depth = parent.depth + 1;
        } else {
            // Root span (script-level span or orphaned custom span)
            rootSpans.push(node);
        }
    }

    // Sort children by start time
    const sortByStartTime = (nodes: SpanNode[]) => {
        nodes.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
        for (const node of nodes) {
            sortByStartTime(node.children);
        }
    };
    sortByStartTime(rootSpans);

    return rootSpans;
}

/**
 * Flatten span tree with depth info for rendering.
 */
function flattenSpanTree(nodes: SpanNode[]): SpanNode[] {
    const result: SpanNode[] = [];
    const flatten = (node: SpanNode) => {
        result.push(node);
        for (const child of node.children) {
            flatten(child);
        }
    };
    for (const node of nodes) {
        flatten(node);
    }
    return result;
}

/**
 * Trace detail modal with waterfall timeline visualization.
 */
export function TraceDetail({ isOpen, onClose, trace, spans }: TraceDetailProps) {
    const [selectedSpan, setSelectedSpan] = useState<SpanNode | null>(null);

    // Format duration
    const formatDuration = (ms: number | null) => {
        if (ms === null) return "—";
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    // Format date
    const formatDate = (date: Date) => {
        return new Date(date).toLocaleString();
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

    // Get status color for waterfall bars
    const getStatusColor = (status: string) => {
        switch (status) {
            case "success":
                return "bg-emerald-500";
            case "blocked":
                return "bg-amber-500";
            case "error":
                return "bg-red-500";
            default:
                return "bg-slate-500";
        }
    };



    // Calculate trace start time for span positioning
    const traceStartTime = new Date(trace.startedAt).getTime();

    // Calculate effective duration including all spans (in case spans overrun trace duration)
    const maxSpanEnd = spans.reduce((max, span) => {
        const end = new Date(span.startedAt).getTime() + (span.durationMs || 0);
        return Math.max(max, end);
    }, traceStartTime + (trace.durationMs || 0));

    // Use computed scale unless trace duration is 0
    const timelineScale = Math.max(1, maxSpanEnd - traceStartTime);

    // Build span tree for nested visualization
    const spanTree = buildSpanTree(spans);
    const flatSpans = flattenSpanTree(spanTree);

    // Generate tick marks (5 ticks including 0 and end)
    const generateTicks = () => {
        const tickCount = 5;
        const ticks: number[] = [];
        for (let i = 0; i < tickCount; i++) {
            ticks.push(Math.round((timelineScale / (tickCount - 1)) * i));
        }
        return ticks;
    };

    const ticks = generateTicks();

    // Calculate bar position based on span's actual start time
    const getBarStyle = (span: SpanInfo) => {
        const spanDuration = span.durationMs || 0;
        const spanStartTime = new Date(span.startedAt).getTime();
        const offset = spanStartTime - traceStartTime;
        const left = (offset / timelineScale) * 100;
        const width = (spanDuration / timelineScale) * 100;

        return {
            left: `${Math.max(0, left)}%`,
            width: `${width}%`,
            minWidth: "2px",
        };
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Trace: ${trace.id.slice(0, 12)}...`}
            size="xl"
        >
            <div className="space-y-6">
                {/* Trace metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                        <div className="text-slate-500 mb-1">Trigger</div>
                        <div className="text-white font-medium">
                            {trace.triggerEvent.replace(/_/g, " ")}
                        </div>
                    </div>
                    <div>
                        <div className="text-slate-500 mb-1">Status</div>
                        <Badge variant={getStatusVariant(trace.status)}>
                            {trace.status}
                        </Badge>
                    </div>
                    <div>
                        <div className="text-slate-500 mb-1">Duration</div>
                        <div className="text-white font-mono">
                            {formatDuration(trace.durationMs)}
                        </div>
                    </div>
                    <div>
                        <div className="text-slate-500 mb-1">Started</div>
                        <div className="text-white">
                            {formatDate(trace.startedAt)}
                        </div>
                    </div>
                </div>

                {/* Additional metadata row */}
                {(trace.userId || trace.requestIp) && (
                    <div className="flex gap-6 text-sm">
                        {trace.userId && (
                            <div>
                                <span className="text-slate-500">User: </span>
                                <code className="text-blue-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                                    {trace.userId}
                                </code>
                            </div>
                        )}
                        {trace.requestIp && (
                            <div>
                                <span className="text-slate-500">IP: </span>
                                <code className="text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                                    {trace.requestIp}
                                </code>
                            </div>
                        )}
                    </div>
                )}

                {/* Status message if any */}
                {trace.statusMessage && (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-300">
                        <Icon name="info" className="inline mr-2 text-slate-500" />
                        {trace.statusMessage}
                    </div>
                )}

                {/* Waterfall timeline */}
                {spans.length > 0 ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-white">
                                Execution Timeline
                            </h3>
                            <span className="text-xs text-slate-500">
                                Trace duration: {formatDuration(trace.durationMs)}
                            </span>
                        </div>

                        {/* Timeline container */}
                        <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
                            {/* Timeline scale with tick marks - add left margin to align with bars */}
                            <div className="relative h-6 mb-2 border-b border-slate-700 ml-16">
                                {ticks.map((tick, i) => {
                                    const isLast = i === ticks.length - 1;
                                    const isFirst = i === 0;
                                    return (
                                        <div
                                            key={i}
                                            className={`absolute flex flex-col items-center ${isLast ? '-translate-x-full' : isFirst ? '' : '-translate-x-1/2'}`}
                                            style={{ left: `${(tick / timelineScale) * 100}%` }}
                                        >
                                            <div className="h-2 w-px bg-slate-600" />
                                            <span className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">
                                                {tick}ms
                                            </span>
                                        </div>
                                    );
                                })}
                                {/* Horizontal line */}
                                <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-700" />
                            </div>

                            {/* Span bars - flattened tree with nesting */}
                            <div className="space-y-1.5 mt-4">
                                {flatSpans.map((span) => (
                                    <div
                                        key={span.id}
                                        className="flex items-start gap-2"
                                    >
                                        {/* Nesting indicator / Layer label - fixed width */}
                                        <div className="w-14 flex-shrink-0 pt-1 flex items-center">
                                            {span.depth === 0 ? (
                                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                                    L{span.layerIndex}
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1">
                                                    {/* Indent markers */}
                                                    {Array.from({ length: span.depth }).map((_, i) => (
                                                        <div key={i} className="w-2 h-4 border-l-2 border-slate-600" />
                                                    ))}
                                                    <span className="text-[10px] text-slate-500">↳</span>
                                                </div>
                                            )}
                                        </div>
                                        {/* Span bar area - flex grow */}
                                        <div className="flex-1">
                                            <div
                                                className="relative h-7 group cursor-pointer"
                                                onClick={() => setSelectedSpan(span)}
                                            >
                                                {/* Background track */}
                                                <div className="absolute inset-0 bg-slate-800/50 rounded" />

                                                {/* Span bar */}
                                                <div
                                                    className={`absolute top-0.5 bottom-0.5 rounded ${getStatusColor(span.status)} ${selectedSpan?.id === span.id
                                                        ? "ring-2 ring-white ring-offset-1 ring-offset-slate-900"
                                                        : "group-hover:brightness-110"
                                                        } transition-all ${span.depth > 0 ? 'bg-opacity-80' : ''}`}
                                                    style={getBarStyle(span)}
                                                >
                                                    {/* Label inside bar */}
                                                    <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                                                        <span className="text-[11px] font-medium text-white truncate drop-shadow-sm">
                                                            {span.depth > 0 && <span className="text-white/60 mr-1">•</span>}
                                                            {span.name}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Duration label */}
                                                <div className="absolute right-2 inset-y-0 flex items-center pointer-events-none">
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                        {formatDuration(span.durationMs)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-slate-500">
                        No spans recorded for this trace
                    </div>
                )}

                {/* Selected span details */}
                {selectedSpan && (
                    <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <Icon name="deployed_code" size="sm" className="text-blue-400" />
                                {selectedSpan.name}
                            </h3>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedSpan(null)}
                                leftIcon="close"
                            >
                                Close
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <div className="text-slate-500 text-xs mb-1">Status</div>
                                <Badge variant={getStatusVariant(selectedSpan.status)}>
                                    {selectedSpan.status}
                                </Badge>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs mb-1">Duration</div>
                                <div className="text-white font-mono text-sm">
                                    {formatDuration(selectedSpan.durationMs)}
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs mb-1">Position</div>
                                <div className="text-white text-sm">
                                    Layer {selectedSpan.layerIndex}, Index {selectedSpan.parallelIndex}
                                </div>
                            </div>
                            <div>
                                <div className="text-slate-500 text-xs mb-1">Script ID</div>
                                <code className="text-xs text-blue-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                    {selectedSpan.scriptId.slice(0, 12)}...
                                </code>
                            </div>
                            {selectedSpan.parentSpanId && (
                                <div className="col-span-2">
                                    <div className="text-slate-500 text-xs mb-1">Parent Span</div>
                                    <div className="text-white text-xs flex items-center gap-1">
                                        <Icon name="subdirectory_arrow_right" size="sm" className="text-slate-500" />
                                        {spans.find(s => s.id === selectedSpan.parentSpanId)?.name || 'Unknown'}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedSpan.statusMessage && (
                            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                                <Icon name="error" size="sm" className="inline mr-2" />
                                {selectedSpan.statusMessage}
                            </div>
                        )}

                        {selectedSpan.attributes && (
                            <div>
                                <div className="text-slate-500 text-xs mb-2 flex items-center gap-1">
                                    <Icon name="data_object" size="sm" />
                                    Output Attributes
                                </div>
                                <pre className="bg-slate-900 rounded-lg p-3 text-xs text-slate-300 overflow-auto h-24 border border-slate-700">
                                    {JSON.stringify(
                                        JSON.parse(selectedSpan.attributes),
                                        null,
                                        2
                                    )}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
