"use client";

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps, ReactFlow, type Node, type Edge } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";
import type { Script } from "@/app/admin/pipelines/actions";
import type { HookName } from "@/lib/pipelines/definitions";

// Pipeline engine limits (keep in sync with pipeline-engine.ts)
const MAX_CHAIN_DEPTH = 10; // Max layers in DAG

// Simple inner node types for the subflow
const InnerForkNode = memo(({ data }: { data: { label: string; color: string } }) => (
    <div className={cn("px-4 py-2 rounded-lg border text-center", data.color)}>
        <span className="text-xs font-bold uppercase tracking-wider">Fork</span>
    </div>
));
InnerForkNode.displayName = "InnerForkNode";

const InnerJoinNode = memo(({ data }: { data: { label: string; color: string } }) => (
    <div className={cn("px-4 py-2 rounded-lg border text-center", data.color)}>
        <span className="text-xs font-bold uppercase tracking-wider">Join</span>
    </div>
));
InnerJoinNode.displayName = "InnerJoinNode";

const InnerScriptNode = memo(({ data }: { data: { script: Script; onOpen: () => void; onRemove: () => void } }) => (
    <div
        onClick={data.onOpen}
        className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group",
            "bg-[#1a2632] border border-[#243647] hover:border-primary/50 transition-colors"
        )}
    >
        <span className="material-symbols-outlined text-base text-gray-400">code</span>
        <span className="text-sm text-white font-mono truncate max-w-[80px]">{data.script.name}</span>
        <button
            onClick={(e) => { e.stopPropagation(); data.onRemove(); }}
            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all cursor-pointer"
        >
            <span className="material-symbols-outlined text-sm">close</span>
        </button>
    </div>
));
InnerScriptNode.displayName = "InnerScriptNode";

const InnerAddNode = memo(({ data }: { data: { onAdd: () => void; label: string; disabled?: boolean } }) => (
    <button
        onClick={data.disabled ? undefined : data.onAdd}
        disabled={data.disabled}
        className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg",
            "border border-dashed",
            "text-xs transition-colors",
            data.disabled
                ? "border-gray-700 text-gray-600 cursor-not-allowed"
                : "border-gray-600 text-gray-400 hover:text-primary hover:border-primary cursor-pointer"
        )}
        title={data.disabled ? "Limit reached" : undefined}
    >
        <span className="material-symbols-outlined text-sm">add</span>
        <span>{data.label}</span>
    </button>
));
InnerAddNode.displayName = "InnerAddNode";

const innerNodeTypes = {
    innerFork: InnerForkNode,
    innerJoin: InnerJoinNode,
    innerScript: InnerScriptNode,
    innerAdd: InnerAddNode,
};

export interface HookPointNodeData {
    hookName: string;
    executionMode: "blocking" | "async" | "enrichment";
    layers: Script[][];
    onAddScript: (hookName: HookName, layerIndex?: number) => void;
    onOpenScript: (script: Script, hookName: HookName) => void;
    onRemoveScript: (scriptId: string, hookName: HookName, layerIndex: number) => void;
}

const modeStyles = {
    blocking: {
        container: "border-red-500/40 bg-red-900/15",
        bar: "bg-gradient-to-r from-red-900/60 via-red-800/40 to-red-900/60 border-red-500/60 text-red-400",
    },
    async: {
        container: "border-green-500/40 bg-green-900/15",
        bar: "bg-gradient-to-r from-green-900/60 via-green-800/40 to-green-900/60 border-green-500/60 text-green-400",
    },
    enrichment: {
        container: "border-blue-500/40 bg-blue-900/15",
        bar: "bg-gradient-to-r from-blue-900/60 via-blue-800/40 to-blue-900/60 border-blue-500/60 text-blue-400",
    },
};

function HookPointNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as HookPointNodeData;
    const styles = modeStyles[nodeData.executionMode] || modeStyles.blocking;
    const layers = useMemo(() => nodeData.layers || [], [nodeData.layers]);
    const totalScripts = useMemo(() => layers.reduce((sum, l) => sum + l.length, 0), [layers]);

    const formatLabel = (name: string) =>
        name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    // Build inner nodes and edges for subflow
    const buildInnerFlow = () => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        const CENTER_X = 140;
        const SCRIPT_WIDTH = 120;
        const SCRIPT_SPACING = 20;
        const VERTICAL_GAP = 50;
        let currentY = 10;

        // Fork node
        nodes.push({
            id: "fork",
            type: "innerFork",
            position: { x: CENTER_X - 40, y: currentY },
            data: { label: "Fork", color: styles.bar },
            draggable: false,
            selectable: false,
        });
        currentY += 40 + VERTICAL_GAP / 2;

        if (totalScripts > 0) {
            layers.forEach((layer, layerIndex) => {
                if (layer.length === 0) return;

                // Calculate positions for scripts in this layer
                const totalWidth = layer.length * SCRIPT_WIDTH + (layer.length - 1) * SCRIPT_SPACING;
                let scriptX = CENTER_X - totalWidth / 2;

                layer.forEach((script, scriptIndex) => {
                    const scriptId = `script_${layerIndex}_${scriptIndex}`;
                    nodes.push({
                        id: scriptId,
                        type: "innerScript",
                        position: { x: scriptX, y: currentY },
                        data: {
                            script,
                            onOpen: () => nodeData.onOpenScript(script, nodeData.hookName as HookName),
                            onRemove: () => nodeData.onRemoveScript(script.id, nodeData.hookName as HookName, layerIndex),
                        },
                        draggable: false,
                        selectable: false,
                    });

                    // Edge from fork/previous layer to script
                    const sourceId = layerIndex === 0 ? "fork" : `layer_join_${layerIndex - 1}`;
                    edges.push({
                        id: `edge_${sourceId}_${scriptId}`,
                        source: sourceId,
                        target: scriptId,
                        style: { stroke: "#64748b", strokeWidth: 2 },
                    });

                    scriptX += SCRIPT_WIDTH + SCRIPT_SPACING;
                });

                currentY += 50;

                // Layer join point (invisible, just for edge routing)
                if (layerIndex < layers.length - 1) {
                    nodes.push({
                        id: `layer_join_${layerIndex}`,
                        type: "innerFork",
                        position: { x: CENTER_X - 30, y: currentY },
                        data: { label: "", color: "opacity-0" },
                        draggable: false,
                        selectable: false,
                    });

                    // Edges from scripts to layer join
                    layer.forEach((_, scriptIndex) => {
                        const scriptId = `script_${layerIndex}_${scriptIndex}`;
                        edges.push({
                            id: `edge_${scriptId}_layer_join_${layerIndex}`,
                            source: scriptId,
                            target: `layer_join_${layerIndex}`,
                            style: { stroke: "#64748b", strokeWidth: 2 },
                        });
                    });

                    currentY += VERTICAL_GAP / 2;
                }
            });

            currentY += VERTICAL_GAP / 2;
        }

        // Add new layer node - disabled if at max chain depth
        const addLayerId = "add_layer";
        const isAtLayerLimit = layers.length >= MAX_CHAIN_DEPTH;
        nodes.push({
            id: addLayerId,
            type: "innerAdd",
            position: { x: CENTER_X - 60, y: currentY },
            data: {
                onAdd: () => nodeData.onAddScript(nodeData.hookName as HookName),
                label: isAtLayerLimit
                    ? `Max ${MAX_CHAIN_DEPTH} layers`
                    : totalScripts > 0
                        ? "Add New Layer"
                        : "Add Script",
                disabled: isAtLayerLimit,
            },
            draggable: false,
            selectable: false,
        });

        // Edge to add layer
        const lastLayerIdx = layers.length - 1;
        if (totalScripts > 0 && layers[lastLayerIdx]) {
            layers[lastLayerIdx].forEach((_, scriptIndex) => {
                const scriptId = `script_${lastLayerIdx}_${scriptIndex}`;
                edges.push({
                    id: `edge_${scriptId}_${addLayerId}`,
                    source: scriptId,
                    target: addLayerId,
                    style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "4,4" },
                });
            });
        } else {
            edges.push({
                id: `edge_fork_${addLayerId}`,
                source: "fork",
                target: addLayerId,
                style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "4,4" },
            });
        }

        currentY += 40 + VERTICAL_GAP / 2;

        // Join node
        nodes.push({
            id: "join",
            type: "innerJoin",
            position: { x: CENTER_X - 35, y: currentY },
            data: { label: "Join", color: styles.bar },
            draggable: false,
            selectable: false,
        });

        edges.push({
            id: `edge_${addLayerId}_join`,
            source: addLayerId,
            target: "join",
            style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "4,4" },
        });

        return { innerNodes: nodes, innerEdges: edges, canvasHeight: currentY + 50 };
    };

    const { innerNodes, innerEdges, canvasHeight } = buildInnerFlow();

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />

            <div className={cn("rounded-xl border-2 border-dashed overflow-hidden", styles.container)}>
                {/* Header */}
                <div className={cn("flex items-center justify-center gap-2 px-4 py-2", styles.bar)}>
                    <span className="material-symbols-outlined text-base">call_split</span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                        {formatLabel(nodeData.hookName)}
                    </span>
                </div>

                {/* Inner ReactFlow for subflow */}
                <div className="bg-[#0a0f14]" style={{ width: 320, height: canvasHeight }}>
                    <ReactFlow
                        nodes={innerNodes}
                        edges={innerEdges}
                        nodeTypes={innerNodeTypes}
                        fitView
                        fitViewOptions={{ padding: 0.1 }}
                        proOptions={{ hideAttribution: true }}
                        nodesDraggable={false}
                        nodesConnectable={false}
                        nodesFocusable={false}
                        elementsSelectable={false}
                        panOnDrag={false}
                        zoomOnScroll={false}
                        zoomOnPinch={false}
                        zoomOnDoubleClick={false}
                        preventScrolling={true}
                        minZoom={1}
                        maxZoom={1}
                    />
                </div>
            </div>

            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const HookPointNode = memo(HookPointNodeComponent);
