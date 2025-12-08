"use client";

import { useMemo } from "react";
import {
    ReactFlow,
    Controls,
    Background,
    BackgroundVariant,
    type Node,
    type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "./node-types";
import { getLayoutedElements } from "./layout";
import type { SwimlaneDef, HookPoint } from "../swimlanes/definitions";
import { isHookPoint, isProcessStep } from "../swimlanes/definitions";
import type { HookName } from "@/lib/pipelines/definitions";
import type { Script } from "@/app/admin/pipelines/actions";

interface PipelineFlowCanvasProps {
    definition: SwimlaneDef;
    pipelineMap: Record<string, Script[][]>;
    onAddScript: (hookName: HookName, layerIndex?: number) => void;
    onOpenScript: (script: Script, hookName: HookName) => void;
    onRemoveScript: (scriptId: string, hookName: HookName, layerIndex: number) => void;
}

// Layout constants
const CENTER_X = 320;
const SECTION_GAP = 90;
const CONTAINER_PADDING = 24;
const BASE_VERTICAL_OFFSET = 30;

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 60;
const LAYOUT_OPTIONS = { nodeWidth: DEFAULT_NODE_WIDTH, nodeHeight: DEFAULT_NODE_HEIGHT, rankSep: 70, nodeSep: 60 };

const NODE_DIMENSIONS = {
    process: { width: 200, height: 64 },
    fork: { width: 240, height: 56 },
    script: { width: 170, height: 52 },
    add: { width: 160, height: 52 },
    addSmall: { width: 52, height: 48 },
    join: { width: 200, height: 52 },
};

type LayoutMeta = { layout?: { width?: number; height?: number } };

const getNodeSize = (node: Node) => {
    const layout = (node.data as LayoutMeta | undefined)?.layout;
    return {
        width: layout?.width || DEFAULT_NODE_WIDTH,
        height: layout?.height || DEFAULT_NODE_HEIGHT,
    };
};

export function PipelineFlowCanvas({
    definition,
    pipelineMap,
    onAddScript,
    onOpenScript,
    onRemoveScript,
}: PipelineFlowCanvasProps) {
    const { nodes, edges, totalHeight } = useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        let currentY = BASE_VERTICAL_OFFSET;
        let previousNodeId: string | null = null;

        const containerInfo: { id: string; x: number; startY: number; endY: number; width: number; mode: string }[] = [];

        definition.flow.forEach((item, flowIndex) => {
            if (isProcessStep(item)) {
                const nodeId = `process_${flowIndex}`;

                nodes.push({
                    id: nodeId,
                    type: "process",
                    position: { x: CENTER_X - NODE_DIMENSIONS.process.width / 2, y: currentY },
                    data: {
                        label: item.label,
                        icon: item.icon,
                        description: item.description,
                        color: definition.color,
                        layout: NODE_DIMENSIONS.process,
                    },
                });

                if (previousNodeId) {
                    edges.push({
                        id: `edge_${previousNodeId}_${nodeId}`,
                        source: previousNodeId,
                        target: nodeId,
                        style: { stroke: "#64748b", strokeWidth: 2 },
                    });
                }

                previousNodeId = nodeId;
                currentY += NODE_DIMENSIONS.process.height + SECTION_GAP / 2;
            } else if (isHookPoint(item)) {
                const hookItem = item as HookPoint;
                const layers = pipelineMap[hookItem.hookName] || [];
                const baseId = `hook_${flowIndex}`;

                const containerStartY = currentY;

                const hookNodes: Node[] = [];
                const hookEdges: Edge[] = [];

                const forkId = `${baseId}_fork`;
                hookNodes.push({
                    id: forkId,
                    type: "fork",
                    position: { x: 0, y: 0 },
                    data: {
                        hookName: hookItem.hookName,
                        executionMode: hookItem.executionMode,
                        layout: NODE_DIMENSIONS.fork,
                    },
                    draggable: false,
                });

                if (previousNodeId) {
                    edges.push({
                        id: `edge_${previousNodeId}_${forkId}`,
                        source: previousNodeId,
                        target: forkId,
                        style: { stroke: "#64748b", strokeWidth: 2 },
                    });
                }

                let upstreamIds: string[] = [forkId];
                const hasScripts = layers.some(layer => layer.length > 0);
                let lastLayerJoinId: string | null = null;

                layers.forEach((layer, layerIndex) => {
                    if (!layer.length) return;

                    const layerNodeIds: string[] = [];

                    layer.forEach((script, scriptIndex) => {
                        const scriptNodeId = `${baseId}_script_${layerIndex}_${scriptIndex}`;
                        layerNodeIds.push(scriptNodeId);

                        hookNodes.push({
                            id: scriptNodeId,
                            type: "script",
                            position: { x: 0, y: 0 },
                            data: {
                                scriptId: script.id,
                                name: script.name,
                                onOpen: () => onOpenScript(script, hookItem.hookName),
                                onRemove: () => onRemoveScript(script.id, hookItem.hookName, layerIndex),
                                layout: NODE_DIMENSIONS.script,
                            },
                            draggable: false,
                        });
                    });

                    const addParallelId = `${baseId}_addParallel_${layerIndex}`;
                    hookNodes.push({
                        id: addParallelId,
                        type: "addLayer",
                        position: { x: 0, y: 0 },
                        data: {
                            onAddLayer: () => onAddScript(hookItem.hookName, layerIndex),
                            label: "+",
                            small: true,
                            layout: NODE_DIMENSIONS.addSmall,
                        },
                        draggable: false,
                    });

                    // Edges from previous gate to this layer's scripts/add-parallel
                    upstreamIds.forEach(sourceId => {
                        layerNodeIds.forEach(targetId => {
                            hookEdges.push({
                                id: `edge_${sourceId}_${targetId}`,
                                source: sourceId,
                                target: targetId,
                                style: { stroke: "#64748b", strokeWidth: 2 },
                            });
                        });

                        hookEdges.push({
                            id: `edge_${sourceId}_${addParallelId}`,
                            source: sourceId,
                            target: addParallelId,
                            style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "4,4" },
                        });
                    });

                    // Join gate for this layer
                    const layerJoinId = `${baseId}_layer_join_${layerIndex}`;
                    hookNodes.push({
                        id: layerJoinId,
                        type: "join",
                        position: { x: 0, y: 0 },
                        data: {
                            executionMode: hookItem.executionMode,
                            layout: NODE_DIMENSIONS.join,
                        },
                        draggable: false,
                    });

                    layerNodeIds.forEach(targetId => {
                        hookEdges.push({
                            id: `edge_${targetId}_${layerJoinId}`,
                            source: targetId,
                            target: layerJoinId,
                            style: { stroke: "#64748b", strokeWidth: 2 },
                        });
                    });

                    lastLayerJoinId = layerJoinId;
                    upstreamIds = [layerJoinId];
                });

                const addLayerId = `${baseId}_addLayer`;
                hookNodes.push({
                    id: addLayerId,
                    type: "addLayer",
                    position: { x: 0, y: 0 },
                    data: {
                        onAddLayer: () => onAddScript(hookItem.hookName),
                        label: hasScripts ? "Add New Layer" : "Add Script",
                        layout: NODE_DIMENSIONS.add,
                    },
                    draggable: false,
                });

                const addSources = lastLayerJoinId ? [lastLayerJoinId] : [forkId];
                addSources.forEach(sourceId => {
                    hookEdges.push({
                        id: `edge_${sourceId}_${addLayerId}`,
                        source: sourceId,
                        target: addLayerId,
                        style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "4,4" },
                    });
                });

                const joinId = `${baseId}_join`;
                hookNodes.push({
                    id: joinId,
                    type: "join",
                    position: { x: 0, y: 0 },
                    data: {
                        executionMode: hookItem.executionMode,
                        layout: NODE_DIMENSIONS.join,
                    },
                    draggable: false,
                });

                hookEdges.push({
                    id: `edge_${addLayerId}_${joinId}`,
                    source: addLayerId,
                    target: joinId,
                    style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "4,4" },
                });

                const { nodes: layoutedHookNodes, edges: layoutedHookEdges } = getLayoutedElements(
                    hookNodes,
                    hookEdges,
                    LAYOUT_OPTIONS
                );

                const bounds = layoutedHookNodes.reduce(
                    (acc, node) => {
                        const { width, height } = getNodeSize(node);
                        acc.minX = Math.min(acc.minX, node.position.x);
                        acc.minY = Math.min(acc.minY, node.position.y);
                        acc.maxX = Math.max(acc.maxX, node.position.x + width);
                        acc.maxY = Math.max(acc.maxY, node.position.y + height);
                        return acc;
                    },
                    { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: 0, maxY: 0 }
                );

                const offsetX = CENTER_X - (bounds.maxX - bounds.minX) / 2 - bounds.minX;
                const offsetY = containerStartY + CONTAINER_PADDING - bounds.minY;

                layoutedHookNodes.forEach(node => {
                    nodes.push({
                        ...node,
                        position: {
                            x: node.position.x + offsetX,
                            y: node.position.y + offsetY,
                        },
                        draggable: false,
                    });
                });

                edges.push(...layoutedHookEdges);

                const groupWidth = bounds.maxX - bounds.minX + CONTAINER_PADDING * 2;
                const groupHeight = bounds.maxY - bounds.minY + CONTAINER_PADDING * 2;

                containerInfo.push({
                    id: `${baseId}_group`,
                    x: CENTER_X - groupWidth / 2,
                    startY: containerStartY,
                    endY: containerStartY + groupHeight,
                    width: groupWidth,
                    mode: hookItem.executionMode,
                });

                previousNodeId = joinId;
                currentY = containerStartY + groupHeight + SECTION_GAP;
            }
        });

        containerInfo.forEach(info => {
            nodes.unshift({
                id: info.id,
                type: "hookGroup",
                position: { x: info.x, y: info.startY },
                data: {
                    executionMode: info.mode,
                    width: info.width,
                    height: info.endY - info.startY,
                },
                style: { zIndex: -1 },
                selectable: false,
                draggable: false,
            });
        });

        return { nodes, edges, totalHeight: currentY };
    }, [definition, pipelineMap, onAddScript, onOpenScript, onRemoveScript]);

    return (
        <div className="w-full rounded-lg overflow-hidden bg-[#0d1117]" style={{ height: Math.max(500, totalHeight + 50) }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={true}
                elementsSelectable={true}
                panOnDrag={true}
                zoomOnScroll={true}
                zoomOnPinch={true}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                selectNodesOnDrag={false}
                minZoom={0.3}
                maxZoom={1.5}
            >
                <Controls showInteractive={false} className="!bg-gray-800 !border-gray-700 !rounded-lg" />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#243647" />
            </ReactFlow>
        </div>
    );
}
