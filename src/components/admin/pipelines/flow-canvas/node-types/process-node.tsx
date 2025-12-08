"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";

export interface ProcessNodeData {
    label: string;
    icon: string;
    description: string;
    color: "emerald" | "blue" | "amber" | "purple";
}

const colorStyles = {
    emerald: {
        bg: "bg-emerald-900/60",
        border: "border-emerald-500",
        text: "text-emerald-400",
    },
    blue: {
        bg: "bg-blue-900/60",
        border: "border-blue-500",
        text: "text-blue-400",
    },
    amber: {
        bg: "bg-amber-900/60",
        border: "border-amber-500",
        text: "text-amber-400",
    },
    purple: {
        bg: "bg-purple-900/60",
        border: "border-purple-500",
        text: "text-purple-400",
    },
};

function ProcessNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as ProcessNodeData;
    const styles = colorStyles[nodeData.color] || colorStyles.blue;

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
            <div
                className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg",
                    "border-2 min-w-[140px]",
                    styles.bg,
                    styles.border
                )}
            >
                <span className={cn("material-symbols-outlined text-lg", styles.text)}>
                    {nodeData.icon}
                </span>
                <div className="flex flex-col">
                    <span className={cn("text-sm font-medium", styles.text)}>
                        {nodeData.label}
                    </span>
                    <span className="text-[10px] text-gray-500 max-w-[120px] truncate">
                        {nodeData.description}
                    </span>
                </div>
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const ProcessNode = memo(ProcessNodeComponent);
