"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";

export interface ForkNodeData {
    hookName: string;
    executionMode: "blocking" | "async" | "enrichment";
    layerIndex?: number;
    onAddParallel?: () => void;
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

function ForkNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as ForkNodeData;
    const styles = modeStyles[nodeData.executionMode] || modeStyles.blocking;

    const formatLabel = (name: string) =>
        name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
            <div
                className={cn(
                    "flex items-center justify-between gap-4 px-4 py-2 rounded-lg",
                    "border min-w-[200px]",
                    styles.bg,
                    styles.border
                )}
            >
                <div className="flex items-center gap-2">
                    <span className={cn("material-symbols-outlined text-base", styles.text)}>
                        call_split
                    </span>
                    <span className={cn("text-xs font-bold uppercase tracking-wider", styles.text)}>
                        {nodeData.layerIndex !== undefined && nodeData.layerIndex > 0
                            ? `Fork Layer ${nodeData.layerIndex + 1}`
                            : `Fork: ${formatLabel(nodeData.hookName)}`}
                    </span>
                </div>
                {nodeData.onAddParallel && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            nodeData.onAddParallel?.();
                        }}
                        className={cn(
                            "nodrag nopan",
                            "flex items-center gap-1 px-2 py-0.5 rounded text-[10px]",
                            "border border-dashed transition-colors cursor-pointer",
                            styles.border,
                            styles.text,
                            "hover:bg-white/10"
                        )}
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        <span>Add</span>
                    </button>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const ForkNode = memo(ForkNodeComponent);
