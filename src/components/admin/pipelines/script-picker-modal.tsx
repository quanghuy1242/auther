"use client";

import { useState, useMemo } from "react";
import { Modal, Input, Icon } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { Script } from "@/app/admin/pipelines/actions";

interface ScriptPickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    hookName: string;
    executionMode: "blocking" | "async" | "enrichment";
    scripts: Script[];
    attachedScriptIds: string[];
    onCreateNew: () => void;
    onSelectScript: (script: Script) => void;
}

const modeInfo: Record<string, { label: string; color: string; description: string }> = {
    blocking: {
        label: "Blocking",
        color: "bg-red-500",
        description: "Can abort the action by returning { allowed = false }",
    },
    async: {
        label: "Async",
        color: "bg-green-500",
        description: "Runs in background, no return value needed",
    },
    enrichment: {
        label: "Enrichment",
        color: "bg-blue-500",
        description: "Returns { data = {...} } to add extra data",
    },
};

export function ScriptPickerModal({
    open,
    onOpenChange,
    hookName,
    executionMode,
    scripts,
    attachedScriptIds,
    onCreateNew,
    onSelectScript,
}: ScriptPickerModalProps) {
    const [search, setSearch] = useState("");

    const formatHookLabel = (name: string) =>
        name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    const mode = modeInfo[executionMode] || modeInfo.blocking;

    // Filter scripts that aren't already attached
    const availableScripts = useMemo(() => {
        const attached = new Set(attachedScriptIds);
        return scripts.filter((s) => {
            if (attached.has(s.id)) return false;
            if (!search.trim()) return true;
            return s.name.toLowerCase().includes(search.toLowerCase());
        });
    }, [scripts, attachedScriptIds, search]);

    const handleCreateNew = () => {
        onOpenChange(false);
        onCreateNew();
    };

    const handleSelectScript = (script: Script) => {
        onOpenChange(false);
        onSelectScript(script);
    };

    return (
        <Modal
            isOpen={open}
            onClose={() => onOpenChange(false)}
            title={`Add Script to ${formatHookLabel(hookName)}`}
            description={`${mode.label} hook — ${mode.description}`}
            size="md"
        >
            <div className="space-y-4 overflow-hidden">
                {/* Create New Button */}
                <button
                    onClick={handleCreateNew}
                    className={cn(
                        "w-full flex items-center gap-3 p-4",
                        "bg-primary/10 border border-primary/30 rounded-lg",
                        "hover:bg-primary/20 transition-colors",
                        "text-left"
                    )}
                >
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Icon name="add" size="md" className="text-primary" />
                    </div>
                    <div className="flex-1">
                        <div className="font-medium text-white">Create New Script</div>
                        <div className="text-sm text-gray-400">
                            Write a new {executionMode} script from template
                        </div>
                    </div>
                    <Icon name="chevron_right" size="sm" className="text-gray-400" />
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-gray-700" />
                    <span className="text-sm text-gray-500">or attach existing</span>
                    <div className="flex-1 h-px bg-gray-700" />
                </div>

                {/* Search */}
                <Input
                    placeholder="Search scripts..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    leftIcon="search"
                />

                {/* Script List */}
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                    {availableScripts.length === 0 ? (
                        <div className="text-center py-6 text-gray-500">
                            {search ? "No scripts match your search" : "No available scripts"}
                        </div>
                    ) : (
                        availableScripts.map((script) => (
                            <button
                                key={script.id}
                                onClick={() => handleSelectScript(script)}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3",
                                    "bg-[#1a2632] border border-[#243647] rounded-lg",
                                    "hover:border-primary/50 hover:bg-[#243647]/50",
                                    "transition-colors text-left"
                                )}
                            >
                                <Icon name="code" size="sm" className="text-gray-400" />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-white truncate">
                                        {script.name}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {script.code.split("\n")[0].replace(/^--\s*/, "")}
                                    </div>
                                </div>
                                <Icon name="add" size="sm" className="text-gray-400" />
                            </button>
                        ))
                    )}
                </div>

                {/* Warning about script compatibility */}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm">
                    <div className="flex items-start gap-2">
                        <Icon name="warning" size="sm" className="text-amber-400 mt-0.5" />
                        <div className="text-amber-200">
                            <strong>Note:</strong> Scripts are generic Lua code. Ensure your script
                            returns the correct format for <strong>{mode.label}</strong> hooks.
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
