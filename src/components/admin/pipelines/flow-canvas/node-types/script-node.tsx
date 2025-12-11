"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";

export interface ScriptNodeData {
    scriptId: string;
    name: string;
    onOpen?: () => void;
    onRemove?: () => void;
}

function ScriptNodeComponent({ data }: NodeProps) {
    const nodeData = data as unknown as ScriptNodeData;

    return (
        <>
            <Handle type="target" position={Position.Top} className="!bg-gray-600 !w-2 !h-2" />
            <div
                className={cn(
                    "nodrag nopan",
                    "flex items-center gap-2 px-3 py-2 rounded-lg",
                    "bg-[#1a2632] border border-[#243647]",
                    "hover:border-primary/50 transition-colors cursor-pointer group",
                    "min-w-[140px] max-w-[180px]"
                )}
                onClick={() => nodeData.onOpen?.()}
            >
                <span className="material-symbols-outlined text-base text-gray-400">
                    code
                </span>
                <span className="flex-1 text-sm text-white truncate font-mono">
                    {nodeData.name}
                </span>
                {nodeData.onRemove && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            nodeData.onRemove?.();
                        }}
                        className="nodrag nopan opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !w-2 !h-2" />
        </>
    );
}

export const ScriptNode = memo(ScriptNodeComponent);
