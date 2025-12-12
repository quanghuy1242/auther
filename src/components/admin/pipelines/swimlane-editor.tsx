"use client";

import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui";
import { toast } from "sonner";
import { Swimlane, SWIMLANE_DEFINITIONS } from "./swimlanes";
import { ScriptEditorModal } from "./script-editor-modal";
import { ScriptPickerModal } from "./script-picker-modal";
import type { HookName } from "@/lib/pipelines/definitions";
import { HOOK_REGISTRY as hookRegistry } from "@/lib/pipelines/definitions";
import { SectionHeader } from "@/components/ui/section-header";
import {
    createScript,
    updateScript,
    deleteScript,
    savePipelineConfig,
    type Script,
    type PipelineConfig,
} from "@/app/admin/pipelines/actions";

import { PipelineGuideModal } from "./pipeline-guide-modal";

interface SwimlaneEditorProps {
    initialScripts: Script[];
    initialConfig: PipelineConfig;
}

export function SwimlaneEditor({
    initialScripts,
    initialConfig,
}: SwimlaneEditorProps) {
    // State
    const [scripts, setScripts] = useState<Script[]>(initialScripts);
    const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig>(initialConfig);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);

    // Script editor modal state
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<Script | null>(null);
    const [targetHook, setTargetHook] = useState<HookName | null>(null);
    const [targetExecutionMode, setTargetExecutionMode] = useState<"blocking" | "async" | "enrichment" | undefined>(undefined);
    const [previousScriptCode, setPreviousScriptCode] = useState<string | undefined>(undefined);

    // Script picker modal state
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [targetLayerIndex, setTargetLayerIndex] = useState<number | undefined>(undefined);

    // Build pipeline map from config
    const pipelineMap = useMemo(() => {
        const map: Record<string, Script[][]> = {};

        for (const [hookName, layers] of Object.entries(pipelineConfig)) {
            // Keep the layer structure
            map[hookName] = (layers as string[][]).map(layer =>
                layer.map(id => scripts.find(s => s.id === id))
                    .filter((s): s is Script => !!s)
            );
        }

        return map;
    }, [pipelineConfig, scripts]);

    // When clicking on "Add Parallel" or "Add New Layer"
    const handleAddScript = useCallback((hookName: HookName, layerIndex?: number) => {
        const hookDef = hookRegistry[hookName];
        setTargetHook(hookName);
        setTargetLayerIndex(layerIndex);
        setTargetExecutionMode(hookDef?.type);
        setIsPickerOpen(true);
    }, []);

    // When creating new from picker
    const handleCreateNewScript = useCallback(() => {
        setEditingScript(null);
        setIsEditorOpen(true);
    }, []);

    // When selecting existing script from picker
    const handleSelectExistingScript = useCallback((script: Script) => {
        if (!targetHook) return;

        setPipelineConfig((prev) => {
            const currentLayers = prev[targetHook] || [];
            const newLayers = [...currentLayers];

            if (targetLayerIndex !== undefined) {
                // Add to specific layer (parallel)
                if (newLayers[targetLayerIndex]) {
                    newLayers[targetLayerIndex] = [...newLayers[targetLayerIndex], script.id];
                } else {
                    // Fallback to new layer if index invalid
                    newLayers.push([script.id]);
                }
            } else {
                // Add as new layer (sequential)
                newLayers.push([script.id]);
            }

            return { ...prev, [targetHook]: newLayers };
        });

        setHasChanges(true);
        toast.success(`Added "${script.name}" to ${targetHook}`);
        setTargetLayerIndex(undefined); // Reset
    }, [targetHook, targetLayerIndex]);

    // Open script for editing
    const handleOpenScript = useCallback((script: Script, hookName: HookName) => {
        const hookDef = hookRegistry[hookName];
        setTargetHook(hookName);
        setTargetExecutionMode(hookDef?.type);
        setEditingScript(script);

        // Compute previous script's code for context.prev completions
        // Find which layer this script is in and get the first script from the previous layer
        const layers = pipelineConfig[hookName] || [];
        let prevCode: string | undefined;
        for (let i = 0; i < layers.length; i++) {
            if (layers[i].includes(script.id)) {
                // Found the layer, get ALL scripts from previous layer for merged context.prev
                if (i > 0 && layers[i - 1].length > 0) {
                    // Collect code from all parallel scripts in previous layer
                    const prevScriptCodes = layers[i - 1]
                        .map(id => scripts.find(s => s.id === id)?.code)
                        .filter((code): code is string => !!code);
                    // Concatenate so extractReturnSchema picks up all return fields
                    prevCode = prevScriptCodes.join("\n\n-- parallel script --\n\n");
                }
                break;
            }
        }
        setPreviousScriptCode(prevCode);

        setIsEditorOpen(true);
    }, [pipelineConfig, scripts]);

    // Handle script drop (drag & drop)
    const handleDropScript = useCallback((scriptId: string, hookName: HookName, layerIndex?: number) => {
        setPipelineConfig((prev) => {
            const currentLayers = prev[hookName] || [];
            const newLayers = [...currentLayers];

            // Check if script already exists in this hook (prevent duplicates for simplicity for now)
            const exists = currentLayers.some(layer => layer.includes(scriptId));
            if (exists) {
                toast.error("Script already exists in this hook");
                return prev;
            }

            if (layerIndex !== undefined) {
                // Drop into existing layer
                if (newLayers[layerIndex]) {
                    newLayers[layerIndex] = [...newLayers[layerIndex], scriptId];
                } else {
                    // If layerIndex is out of bounds, add as a new layer
                    newLayers.push([scriptId]);
                }
            } else {
                // Drop as new layer
                newLayers.push([scriptId]);
            }

            return { ...prev, [hookName]: newLayers };
        });
        setHasChanges(true);
        toast.success(`Added script to ${hookName}`);
    }, []);

    // Handle removing script
    const handleRemoveScript = useCallback((scriptId: string, hookName: HookName, layerIndex?: number) => {
        setPipelineConfig((prev) => {
            const currentLayers = prev[hookName] || [];

            // If layerIndex is provided, remove from specific layer
            // Otherwise remove from all layers (legacy behavior support)
            const newLayers = currentLayers.map((layer, idx) => {
                if (layerIndex === undefined || idx === layerIndex) {
                    return layer.filter(id => id !== scriptId);
                }
                return layer;
            }).filter(layer => layer.length > 0); // Remove empty layers

            return { ...prev, [hookName]: newLayers };
        });
        setHasChanges(true);
        toast.success("Removed script from pipeline");
    }, []);

    // Save script (create or update)
    const handleScriptSave = useCallback(async (name: string, code: string) => {
        if (editingScript) {
            // Update
            const result = await updateScript(editingScript.id, { name, code });
            if (!result.success) {
                toast.error(result.error);
                return;
            }

            setScripts((prev) => prev.map((s) => (s.id === editingScript.id ? { ...s, name, code } : s)));
            toast.success("Script updated");
        } else {
            // Create
            const result = await createScript(name, code);
            if (!result.success || !result.script) {
                toast.error(result.error);
                return;
            }

            setScripts((prev) => [...prev, result.script!]);

            // If adding to a flow
            if (targetHook) {
                handleSelectExistingScript(result.script!);
            } else {
                toast.success("Script created");
            }
        }

        setIsEditorOpen(false);
        setEditingScript(null);
    }, [editingScript, targetHook, handleSelectExistingScript]);

    // Delete script
    const handleScriptDelete = useCallback(async () => {
        if (!editingScript) return;

        const result = await deleteScript(editingScript.id);
        if (!result.success) {
            toast.error(result.error || "Failed to delete script");
            return;
        }

        // Remove from scripts list
        setScripts((prev) => prev.filter((s) => s.id !== editingScript.id));

        // Remove from all hooks
        setPipelineConfig((prev) => {
            const newConfig = { ...prev };
            for (const hookName of Object.keys(newConfig)) {
                newConfig[hookName as HookName] = (newConfig[hookName as HookName] || [])
                    .map((layer) => layer.filter((id) => id !== editingScript.id))
                    .filter((layer) => layer.length > 0);
            }
            return newConfig;
        });

        setHasChanges(true);
        setIsEditorOpen(false);
        setEditingScript(null);
        toast.success("Script deleted");
    }, [editingScript]);

    // Save final config
    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            const result = await savePipelineConfig(pipelineConfig);
            if (result.success) {
                toast.success("Pipeline configuration saved");
                setHasChanges(false);
            } else {
                toast.error(result.error || "Failed to save configuration");
            }
        } catch {
            toast.error("Failed to save configuration");
        } finally {
            setIsSaving(false);
        }
    }, [pipelineConfig]);

    return (
        <div className="flex flex-col gap-4">
            <SectionHeader
                title="Pipeline Configuration"
                description="Attach Lua scripts to authentication hooks"
                action={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            leftIcon="info"
                            onClick={() => setIsGuideOpen(true)}
                        >
                            Guide
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !hasChanges}
                            leftIcon={isSaving ? "sync" : "save"}
                            variant={hasChanges ? "primary" : "secondary"}
                        >
                            {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                }
            />

            <PipelineGuideModal
                isOpen={isGuideOpen}
                onClose={() => setIsGuideOpen(false)}
            />

            {/* Swimlanes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0d1117] rounded-xl border border-[#243647]">
                {SWIMLANE_DEFINITIONS.map((swimlane, index) => (
                    <Swimlane
                        key={swimlane.id}
                        definition={swimlane}
                        pipelineMap={pipelineMap}
                        defaultExpanded={index === 0}
                        onAddScript={handleAddScript}
                        onOpenScript={handleOpenScript}
                        onDropScript={handleDropScript}
                        onRemoveScript={handleRemoveScript}
                    />
                ))}

                {/* Legend */}
                <div className="bg-[#1a2632] border border-[#243647] rounded-xl p-4">
                    <div className="flex items-center gap-6 text-xs">
                        <span className="font-semibold text-white">Legend:</span>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <span className="text-gray-400">Blocking (can abort)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="text-gray-400">Async (fire & forget)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-gray-400">Enrichment (merge data)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Script editor modal */}
            <ScriptEditorModal
                open={isEditorOpen}
                onOpenChange={setIsEditorOpen}
                script={editingScript}
                executionMode={targetExecutionMode}
                hookName={targetHook || undefined}
                previousScriptCode={previousScriptCode}
                onSave={handleScriptSave}
                onDelete={handleScriptDelete}
            />

            {/* Script picker modal */}
            {targetHook && targetExecutionMode && (
                <ScriptPickerModal
                    open={isPickerOpen}
                    onOpenChange={setIsPickerOpen}
                    hookName={targetHook}
                    executionMode={targetExecutionMode}
                    scripts={scripts}
                    attachedScriptIds={(pipelineConfig[targetHook] || []).flat()}
                    onCreateNew={handleCreateNewScript}
                    onSelectScript={handleSelectExistingScript}
                />
            )}
        </div>
    );
}
