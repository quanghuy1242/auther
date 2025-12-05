"use client";

import * as React from "react";
import { Input, Icon, Select } from "@/components/ui";

interface PermissionRowProps {
    name: string;
    requiredRelation: string;
    availableRelations: string[];
    onNameChange: (name: string) => void;
    onRelationChange: (relation: string) => void;
    onRemove: () => void;
    disabled?: boolean;
}

export function PermissionRow({
    name,
    requiredRelation,
    availableRelations,
    onNameChange,
    onRelationChange,
    onRemove,
    disabled,
}: PermissionRowProps) {
    return (
        <div className="flex items-start gap-3 p-3 rounded bg-[#1A2530]/50 border border-slate-700/50 hover:border-slate-600 transition-colors">
            {/* Permission Name */}
            <div className="flex-1 space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Permission Name
                </label>
                <Input
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="e.g. read"
                    className="h-8 text-sm font-mono bg-[#111921] border-slate-700"
                    disabled={disabled}
                />
            </div>

            {/* Required Relation */}
            <div className="flex-1 space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Requires Relation
                </label>
                <Select
                    value={requiredRelation}
                    onChange={onRelationChange}
                    options={availableRelations.map(rel => ({ value: rel, label: rel }))}
                    placeholder="Select a relation..."
                    triggerClassName="h-8 py-1 text-sm font-mono bg-[#111921] border-slate-700"
                    disabled={disabled}
                />
            </div>

            {/* Delete Button */}
            <div className="pt-6">
                <button
                    onClick={onRemove}
                    disabled={disabled}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-slate-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete Permission"
                >
                    <Icon name="delete" size="sm" />
                </button>
            </div>
        </div>
    );
}
