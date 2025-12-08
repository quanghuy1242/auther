"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui";
import type { HookName } from "@/lib/pipelines/definitions";
import type { Script } from "@/app/admin/pipelines/actions";

interface GhostHookZoneProps {
    hookName: HookName;
    executionMode: "blocking" | "async" | "enrichment";
    description: string;
    color: string;
    attachedScripts: Script[];
    onAddScript: (hookName: HookName) => void;
    onOpenScript: (script: Script, hookName: HookName) => void;
    onDropScript: (scriptId: string, hookName: HookName) => void;
    onRemoveScript: (scriptId: string, hookName: HookName) => void;
}

const MODE_LABELS: Record<string, { label: string; color: string }> = {
    blocking: { label: "Blocking", color: "text-red-400 border-red-500/50" },
    async: { label: "Async", color: "text-green-400 border-green-500/50" },
    enrichment: { label: "Enrichment", color: "text-blue-400 border-blue-500/50" },
};

/**
 * Droppable zone for attaching scripts to a hook.
 * Shows ghost state when empty, expands to show chain when populated.
 */
export function GhostHookZone({
    hookName,
    executionMode,
    description,
    color,
    attachedScripts,
    onAddScript,
    onOpenScript,
    onDropScript,
    onRemoveScript,
}: GhostHookZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const isEmpty = attachedScripts.length === 0;
    const modeInfo = MODE_LABELS[executionMode];

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const type = e.dataTransfer.getData("application/reactflow");
        if (type?.startsWith("existing_")) {
            const scriptId = type.replace("existing_", "");
            onDropScript(scriptId, hookName);
        } else if (type === "script") {
            // New script - trigger add flow
            onAddScript(hookName);
        }
    };

    // Color variants for the zone border
    const borderColorVariants: Record<string, string> = {
        emerald: "border-emerald-500/30 hover:border-emerald-500/60",
        blue: "border-blue-500/30 hover:border-blue-500/60",
        amber: "border-amber-500/30 hover:border-amber-500/60",
        purple: "border-purple-500/30 hover:border-purple-500/60",
    };

    const formatHookLabel = (name: string) =>
        name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    return (
        <div className="flex flex-col items-center">
            {/* Hook Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => isEmpty ? onAddScript(hookName) : setIsExpanded(!isExpanded)}
                className={cn(
                    "relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg cursor-pointer transition-all",
                    "min-w-[120px]",
                    isEmpty
                        ? "border-2 border-dashed"
                        : "border-2 border-solid",
                    borderColorVariants[color] || borderColorVariants.blue,
                    isDragOver && "border-primary bg-primary/10 scale-105",
                )}
                title={description}
            >
                {/* Mode badge */}
                <div className={cn("text-[9px] font-semibold uppercase tracking-wider", modeInfo.color)}>
                    {modeInfo.label}
                </div>

                {/* Hook name */}
                <div className="text-xs font-medium text-white">
                    {formatHookLabel(hookName)}
                </div>

                {/* Content: Empty or Count */}
                {isEmpty ? (
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-1">
                        <Icon name="add" size="sm" />
                        <span>Click or drop</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                        <Icon name="code" size="sm" />
                        <span>{attachedScripts.length} script{attachedScripts.length > 1 ? "s" : ""}</span>
                        <Icon
                            name={isExpanded ? "expand_less" : "expand_more"}
                            size="sm"
                            className="ml-1"
                        />
                    </div>
                )}
            </div>

            {/* Expanded Chain View */}
            {!isEmpty && isExpanded && (
                <div className="flex flex-col items-center mt-2 gap-1">
                    {attachedScripts.map((script, index) => (
                        <div key={script.id} className="flex flex-col items-center">
                            {/* Connector line */}
                            {index > 0 && (
                                <div className="w-px h-2 bg-gray-600" />
                            )}

                            {/* Script node */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenScript(script, hookName);
                                }}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-md",
                                    "bg-gray-800 border border-gray-700",
                                    "hover:border-primary cursor-pointer transition-all",
                                    "text-xs text-white"
                                )}
                            >
                                <Icon name="code" size="sm" className="text-gray-400" />
                                <span className="max-w-[100px] truncate">{script.name}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveScript(script.id, hookName);
                                    }}
                                    className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
                                >
                                    <Icon name="close" size="sm" />
                                </button>
                            </div>

                            {/* Chain connector to next */}
                            {index < attachedScripts.length - 1 && (
                                <div className="flex flex-col items-center">
                                    <div className="w-px h-2 bg-gray-600" />
                                    <Icon name="expand_more" size="sm" className="text-gray-600" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add more button */}
                    <div className="flex flex-col items-center mt-1">
                        <div className="w-px h-2 bg-gray-600" />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onAddScript(hookName);
                            }}
                            className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-md",
                                "border border-dashed border-gray-600",
                                "text-[10px] text-gray-500 hover:text-gray-300 hover:border-gray-500",
                                "transition-all"
                            )}
                        >
                            <Icon name="add" size="sm" />
                            <span>Add to chain</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
