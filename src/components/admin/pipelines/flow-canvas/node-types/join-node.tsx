"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";

export interface JoinNodeData {
    executionMode: "blocking" | "async" | "enrichment";
    layout?: { width?: number; height?: number };
}

const modeStyles = {
    blocking: {
        bg: "bg-gradient-to-r from-red-900/60 via-red-800/40 to-red-900/60",
        border: "border-red-500/60",
        text: "text-red-400",
    },
    async: {
        bg: "bg-gradient-to-r from-green-900/60 via-green-800/40 to-green-900/60",
        border: "border-green-500/60",
        text: "text-green-400",
    },
    enrichment: {
        bg: "bg-gradient-to-r from-blue-900/60 via-blue-800/40 to-blue-900/60",
        border: "border-blue-500/60",
        text: "text-blue-400",
    },
};

function JoinNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as JoinNodeData;
    const styles = modeStyles[nodeData.executionMode] || modeStyles.blocking;
    const nodeWidth = nodeData.layout?.width;

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
            <div
                className={cn(
                    "flex items-center justify-center gap-2 px-4 py-2 rounded-lg",
                    "border",
                    styles.bg,
                    styles.border
                )}
                style={nodeWidth ? { width: nodeWidth } : { minWidth: 160 }}
            >
                <span className={cn("material-symbols-outlined text-base", styles.text)}>
                    call_merge
                </span>
                <span className={cn("text-xs font-bold uppercase tracking-wider", styles.text)}>
                    Join & Sync
                </span>
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const JoinNode = memo(JoinNodeComponent);
