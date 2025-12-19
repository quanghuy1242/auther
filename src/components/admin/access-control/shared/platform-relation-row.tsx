"use client";

import * as React from "react";
import { Input, Icon, Select } from "@/components/ui";

export interface PlatformRelation {
    name: string;
    inheritsFrom: string[];
}

interface PlatformRelationRowProps {
    relation: PlatformRelation;
    allRelations: PlatformRelation[];
    onChange: (updated: PlatformRelation) => void;
    onRemove: () => void;
    disabled?: boolean;
    isEditing?: boolean; // If true, name field is disabled (editing existing)
}

/**
 * A row for editing a single relation with its inheritance.
 * Used in the platform authorization model editor.
 */
export function PlatformRelationRow({
    relation,
    allRelations,
    onChange,
    onRemove,
    disabled,
    isEditing,
}: PlatformRelationRowProps) {
    // Get available relations for inheritance (exclude self and prevent circular)
    const availableForInheritance = React.useMemo(() => {
        return allRelations
            .filter(r => r.name !== relation.name && r.name.trim() !== "")
            .map(r => ({ value: r.name, label: r.name }));
    }, [allRelations, relation.name]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ ...relation, name: e.target.value });
    };

    const handleInheritsChange = (value: string) => {
        // Toggle: if already selected, remove; otherwise add
        const current = new Set(relation.inheritsFrom);
        if (current.has(value)) {
            current.delete(value);
        } else {
            current.add(value);
        }
        onChange({ ...relation, inheritsFrom: Array.from(current) });
    };

    const removeInheritance = (name: string) => {
        onChange({
            ...relation,
            inheritsFrom: relation.inheritsFrom.filter(n => n !== name)
        });
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded bg-[#1A2530]/50 border border-slate-700/50 hover:border-slate-600 transition-colors">
            {/* Relation Name */}
            <div className="w-40 space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Relation Name
                </label>
                <Input
                    value={relation.name}
                    onChange={handleNameChange}
                    placeholder="e.g. admin"
                    className="h-8 text-sm font-mono bg-[#111921] border-slate-700"
                    disabled={disabled || isEditing}
                />
            </div>

            {/* Inherits From */}
            <div className="flex-1 space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Inherits From (gets all permissions of)
                </label>
                <div className="min-h-[32px] px-2 py-1 rounded-md border border-slate-700 bg-[#111921] flex flex-wrap items-center gap-1.5">
                    {relation.inheritsFrom.map(name => (
                        <span
                            key={name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-mono"
                        >
                            {name}
                            {!disabled && (
                                <button
                                    type="button"
                                    onClick={() => removeInheritance(name)}
                                    className="hover:text-red-400 transition-colors"
                                >
                                    <Icon name="close" size="xs" />
                                </button>
                            )}
                        </span>
                    ))}
                    {availableForInheritance.length > 0 && !disabled && (
                        <Select
                            options={availableForInheritance.filter(
                                opt => !relation.inheritsFrom.includes(opt.value)
                            )}
                            value=""
                            onChange={handleInheritsChange}
                            placeholder="+ Add"
                            className="h-6 min-w-[80px] max-w-[100px] text-xs bg-transparent border-0"
                        />
                    )}
                    {relation.inheritsFrom.length === 0 && availableForInheritance.length === 0 && (
                        <span className="text-xs text-gray-500 italic">Base role (no inheritance)</span>
                    )}
                </div>
            </div>

            {/* Delete Button */}
            <div className="pt-5">
                <button
                    onClick={onRemove}
                    disabled={disabled}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete Relation"
                >
                    <Icon name="delete" size="sm" />
                </button>
            </div>
        </div>
    );
}
