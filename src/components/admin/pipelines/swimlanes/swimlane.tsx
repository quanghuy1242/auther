"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui";
import type { SwimlaneDef } from "./definitions";
import { isHookPoint } from "./definitions";
import { PipelineFlowCanvas } from "../flow-canvas";
import type { HookName } from "@/lib/pipelines/definitions";
import type { Script } from "@/app/admin/pipelines/actions";

interface SwimlanePipelineMap {
    [hookName: string]: Script[][];
}

interface SwimlaneProps {
    definition: SwimlaneDef;
    pipelineMap: SwimlanePipelineMap;
    defaultExpanded?: boolean;
    onAddScript: (hookName: HookName, layerIndex?: number) => void;
    onOpenScript: (script: Script, hookName: HookName) => void;
    onDropScript: (scriptId: string, hookName: HookName, layerIndex?: number) => void;
    onRemoveScript: (scriptId: string, hookName: HookName, layerIndex: number) => void;
}

const colorVariants: Record<string, { header: string; border: string; badge: string }> = {
    emerald: {
        header: "from-emerald-900/50 to-emerald-950/30",
        border: "border-emerald-800/50",
        badge: "bg-emerald-500/20 text-emerald-400",
    },
    blue: {
        header: "from-blue-900/50 to-blue-950/30",
        border: "border-blue-800/50",
        badge: "bg-blue-500/20 text-blue-400",
    },
    amber: {
        header: "from-amber-900/50 to-amber-950/30",
        border: "border-amber-800/50",
        badge: "bg-amber-500/20 text-amber-400",
    },
    purple: {
        header: "from-purple-900/50 to-purple-950/30",
        border: "border-purple-800/50",
        badge: "bg-purple-500/20 text-purple-400",
    },
};

export function Swimlane({
    definition,
    pipelineMap,
    defaultExpanded = false,
    onAddScript,
    onOpenScript,
    onRemoveScript,
}: SwimlaneProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const colors = colorVariants[definition.color] || colorVariants.blue;

    // Count total scripts attached
    const totalScripts = definition.flow
        .filter(isHookPoint)
        .reduce((sum, hook) => {
            const layers = pipelineMap[hook.hookName] || [];
            return sum + layers.flat().length;
        }, 0);

    return (
        <div className={cn("rounded-xl border overflow-hidden transition-all duration-200", colors.border)}>
            {/* Collapsible Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn(
                    "w-full flex items-center justify-between px-4 py-3",
                    "bg-gradient-to-r transition-colors",
                    colors.header,
                    "hover:brightness-110"
                )}
            >
                <div className="flex items-center gap-3">
                    <Icon
                        name={isExpanded ? "expand_less" : "expand_more"}
                        size="sm"
                        className="text-gray-400"
                    />
                    <h3 className="text-sm font-semibold text-white">{definition.title}</h3>
                    <span className="text-xs text-gray-400">{definition.description}</span>
                </div>

                <div className="flex items-center gap-2">
                    {totalScripts > 0 ? (
                        <div className={cn("px-2 py-0.5 rounded-full text-xs font-medium", colors.badge)}>
                            {totalScripts} script{totalScripts !== 1 ? "s" : ""}
                        </div>
                    ) : (
                        <span className="text-xs text-gray-500">No scripts</span>
                    )}
                </div>
            </button>

            {/* Expanded Content - React Flow Canvas */}
            {isExpanded && (
                <div className="bg-[#0d1117]">
                    <PipelineFlowCanvas
                        definition={definition}
                        pipelineMap={pipelineMap}
                        onAddScript={onAddScript}
                        onOpenScript={onOpenScript}
                        onRemoveScript={onRemoveScript}
                    />
                </div>
            )}
        </div>
    );
}
