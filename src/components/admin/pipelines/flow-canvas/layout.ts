import Dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

export interface LayoutOptions {
    direction?: "TB" | "LR";
    nodeWidth?: number;
    nodeHeight?: number;
    rankSep?: number;
    nodeSep?: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
    direction: "TB",
    nodeWidth: 180,
    nodeHeight: 50,
    rankSep: 50,
    nodeSep: 40,
};

function getNodeDimensions(node: Node, opts: LayoutOptions) {
    const data = node.data as { width?: number; height?: number; layout?: { width?: number; height?: number } } | undefined;

    const width: number = node.width
        ?? data?.layout?.width
        ?? data?.width
        ?? opts.nodeWidth
        ?? DEFAULT_OPTIONS.nodeWidth
        ?? 180;

    const height: number = node.height
        ?? data?.layout?.height
        ?? data?.height
        ?? opts.nodeHeight
        ?? DEFAULT_OPTIONS.nodeHeight
        ?? 50;

    return { width, height };
}

export function getLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: opts.direction,
        ranksep: opts.rankSep,
        nodesep: opts.nodeSep,
    });

    // Add nodes to dagre
    nodes.forEach((node) => {
        const { width, height } = getNodeDimensions(node, opts);
        g.setNode(node.id, { width, height });
    });

    // Add edges to dagre
    edges.forEach((edge) => {
        g.setEdge(edge.source, edge.target);
    });

    // Run layout
    Dagre.layout(g);

    // Get graph dimensions
    const graphInfo = g.graph();
    const graphWidth = graphInfo.width || 400;
    const graphCenterX = graphWidth / 2;

    // Group nodes by rank (Y position) to identify parallel nodes
    const nodesByRank = new Map<number, Node[]>();
    const nodePositions = new Map<string, { x: number; y: number }>();

    nodes.forEach((node) => {
        const pos = g.node(node.id);
        nodePositions.set(node.id, { x: pos.x, y: pos.y });

        // Round Y to group nodes at same rank
        const rankY = Math.round(pos.y / 10) * 10;
        if (!nodesByRank.has(rankY)) {
            nodesByRank.set(rankY, []);
        }
        nodesByRank.get(rankY)!.push(node);
    });

    // Apply positions - center single nodes, spread parallel nodes
    const layoutedNodes = nodes.map((node) => {
        const pos = nodePositions.get(node.id)!;
        const { width, height } = getNodeDimensions(node, opts);

        // Find how many nodes are at this rank
        const rankY = Math.round(pos.y / 10) * 10;
        const nodesAtRank = nodesByRank.get(rankY) || [];

        const x = nodesAtRank.length === 1
            ? graphCenterX - width / 2
            : pos.x - width / 2;

        return {
            ...node,
            position: {
                x,
                y: pos.y - height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}
