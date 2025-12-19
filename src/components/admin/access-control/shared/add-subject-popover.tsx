"use client";

import * as React from "react";
import { Button, Icon, Input, Popover, PopoverTrigger, PopoverContent, Select } from "@/components/ui";
import type { Subject } from "./subject-badge";

interface AddSubjectPopoverProps {
    onAdd: (subject: Subject) => void;
    availableRelations?: string[];
    disabled?: boolean;
}

export function AddSubjectPopover({ onAdd, availableRelations = [], disabled }: AddSubjectPopoverProps) {
    const [source, setSource] = React.useState("");
    const [role, setRole] = React.useState("");
    const [isOpen, setIsOpen] = React.useState(false);

    // "custom" mode enables raw input
    const [isCustom, setIsCustom] = React.useState(availableRelations.length === 0);

    // Initial State Reset
    React.useEffect(() => {
        if (isOpen) {
            setIsCustom(availableRelations.length === 0);
            setSource("");
            setRole("");
        }
    }, [isOpen, availableRelations.length]);

    const handleAdd = () => {
        if (source.trim()) {
            onAdd({ type: source.trim(), relation: role.trim() || undefined });
            setSource("");
            setRole("");
            setIsOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
        }
    };

    // Parse availableRelations into Source -> Roles map
    const relationMap = React.useMemo(() => {
        const map: Record<string, string[]> = {};

        availableRelations.forEach(item => {
            if (item.includes("#")) {
                const [base, extension] = item.split("#");
                if (!map[base]) map[base] = [];
                if (extension && !map[base].includes(extension)) {
                    map[base].push(extension);
                }
            } else {
                if (!map[item]) map[item] = [];
            }
        });

        return map;
    }, [availableRelations]);

    // Source Options for First Dropdown
    const sourceOptions = React.useMemo(() => {
        return Object.keys(relationMap).map(k => ({ value: k, label: k }));
    }, [relationMap]);

    // Role Options for Second Dropdown (based on selected Source)
    const roleOptions = React.useMemo(() => {
        if (!source || !relationMap[source]) return [];
        return relationMap[source].map(r => ({ value: r, label: r }));
    }, [source, relationMap]);

    // Reset role when source changes
    const handleSourceChange = (newSource: string) => {
        setSource(newSource);
        setRole("");
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    disabled={disabled}
                    className="h-6 text-xs text-primary hover:text-blue-400 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon name="add" size="xs" className="pt-0.5" />
                    <span className="font-medium">Add</span>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-4 bg-[#1A2530] border-[#243647]">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h5 className="text-xs font-semibold text-white">Add Inherited Relation</h5>
                        {availableRelations.length > 0 && (
                            <button
                                onClick={() => setIsCustom(!isCustom)}
                                className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                            >
                                {isCustom ? "Select from list" : "Type custom"}
                            </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        {/* Source Input */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                                Source (Type or Relation)
                            </label>

                            {!isCustom && sourceOptions.length > 0 ? (
                                <Select
                                    options={sourceOptions}
                                    value={source}
                                    onChange={handleSourceChange}
                                    placeholder="Select source..."
                                    className="h-9 text-xs bg-[#111921] border-slate-700 w-full"
                                />
                            ) : (
                                <Input
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="e.g. group, owner, viewer"
                                    className="h-9 text-xs bg-[#111921] border-slate-700 w-full"
                                    autoFocus
                                />
                            )}
                        </div>

                        {/* Role Input (Dependent) */}
                        {(!isCustom || source) && (
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                    <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                                        Specific Role (Optional)
                                    </label>
                                    <div className="group relative flex items-center">
                                        <Icon name="help" size="sm" className="text-gray-500 hover:text-gray-300 transition-colors cursor-help" />
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 border border-slate-700 rounded shadow-xl text-[10px] text-gray-300 hidden group-hover:block z-50">
                                            Specify a role on the source. <br />
                                            e.g. For source <strong>group</strong>, select <strong>member</strong>.
                                        </div>
                                    </div>
                                </div>

                                {!isCustom && roleOptions.length > 0 ? (
                                    <Select
                                        options={roleOptions}
                                        value={role}
                                        onChange={setRole}
                                        placeholder="Select role (optional)"
                                        className="h-9 text-xs bg-[#111921] border-slate-700 w-full"

                                    />
                                ) : (
                                    <Input
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="e.g. member"
                                        className="h-9 text-xs bg-[#111921] border-slate-700 w-full"
                                        disabled={!isCustom && !source}
                                    />
                                )}
                            </div>
                        )}

                        <Button size="sm" className="w-full mt-2" onClick={handleAdd} disabled={!source.trim()}>
                            Add Relation
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
