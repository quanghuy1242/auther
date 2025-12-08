"use client";

import { memo } from "react";
import { type NodeProps } from "@xyflow/react";

export interface HookGroupNodeData {
    executionMode: "blocking" | "async" | "enrichment";
    width?: number;
    height?: number;
}

const modeStyles = {
    blocking: "border-red-500/40 bg-red-900/15",
    async: "border-green-500/40 bg-green-900/15",
    enrichment: "border-blue-500/40 bg-blue-900/15",
};

function HookGroupNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as HookGroupNodeData;
    const styles = modeStyles[nodeData.executionMode] || modeStyles.blocking;
    const width = nodeData.width || 300;
    const height = nodeData.height || 200;

    return (
        <div
            className={`rounded-xl border-2 border-dashed ${styles}`}
            style={{ width, height, pointerEvents: "none" }}
        />
    );
}

export const HookGroupNode = memo(HookGroupNodeComponent);
