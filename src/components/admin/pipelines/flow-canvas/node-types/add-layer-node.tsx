"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";

export interface AddLayerNodeData {
    onAddLayer?: () => void;
    label?: string;
    small?: boolean;
}

function AddLayerNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as AddLayerNodeData;
    const label = nodeData.label || "Add New Layer";
    const small = nodeData.small || false;

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
            <button
                onClick={() => nodeData.onAddLayer?.()}
                className={cn(
                    "nodrag nopan",
                    "flex items-center justify-center rounded-lg cursor-pointer",
                    "border border-dashed border-gray-600",
                    "text-gray-400 hover:text-primary hover:border-primary transition-colors",
                    small
                        ? "w-10 h-10 text-lg"
                        : "gap-2 px-4 py-2 text-sm"
                )}
            >
                <span className={cn("material-symbols-outlined", small ? "text-lg" : "text-base")}>add</span>
                {!small && <span>{label}</span>}
            </button>
            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const AddLayerNode = memo(AddLayerNodeComponent);
