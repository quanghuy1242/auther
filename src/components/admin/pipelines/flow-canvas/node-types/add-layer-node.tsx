"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";

export interface AddLayerNodeData {
    onAddLayer?: () => void;
    label?: string;
    small?: boolean;
    disabled?: boolean;
    layout?: { width?: number; height?: number };
}

function AddLayerNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as AddLayerNodeData;
    const label = nodeData.label || "Add New Layer";
    const small = nodeData.small || false;
    const disabled = nodeData.disabled || false;
    const nodeWidth = nodeData.layout?.width;

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
            <button
                onClick={disabled ? undefined : () => nodeData.onAddLayer?.()}
                disabled={disabled}
                className={cn(
                    "nodrag nopan",
                    "flex items-center justify-center rounded-lg",
                    "border border-dashed transition-colors",
                    disabled
                        ? "border-gray-700 text-gray-600 cursor-not-allowed"
                        : "border-gray-600 text-gray-400 hover:text-primary hover:border-primary cursor-pointer",
                    small
                        ? "w-10 h-10 text-lg"
                        : "gap-2 px-4 py-2 text-sm"
                )}
                style={!small && nodeWidth ? { width: nodeWidth } : undefined}
                title={disabled ? "Limit reached" : undefined}
            >
                <span className={cn("material-symbols-outlined", small ? "text-lg" : "text-base")}>add</span>
                {!small && <span>{label}</span>}
            </button>
            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const AddLayerNode = memo(AddLayerNodeComponent);

