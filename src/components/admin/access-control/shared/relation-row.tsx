"use client";

import * as React from "react";
import { Input, Icon, Switch } from "@/components/ui";
import { SubjectBadge, type Subject } from "./subject-badge";
import { AddSubjectPopover } from "./add-subject-popover";

interface RelationRowProps {
    name: string;
    subjects: Subject[];
    isHierarchy?: boolean;
    availableRelations?: string[];
    onNameChange: (name: string) => void;
    onSubjectsChange: (subjects: Subject[]) => void;
    onToggleHierarchy?: (isHierarchy: boolean) => void;
    onRemove: () => void;
    disabled?: boolean;
    isExisting?: boolean; // If true, name field is disabled (existing relation cannot be renamed)
    hideHierarchy?: boolean; // If true, hide the recursive toggle
}

export function RelationRow({
    name,
    subjects,
    isHierarchy = false,
    availableRelations,
    onNameChange,
    onSubjectsChange,
    onToggleHierarchy,
    onRemove,
    disabled,
    isExisting,
    hideHierarchy,
}: RelationRowProps) {
    const handleRemoveSubject = (index: number) => {
        onSubjectsChange(subjects.filter((_, i) => i !== index));
    };

    const handleAddSubject = (subject: Subject) => {
        onSubjectsChange([...subjects, subject]);
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded bg-[#1A2530]/50 border border-slate-700/50 hover:border-slate-600 transition-colors">
            {/* Relation Name */}
            <div className="w-32 min-w-[110px] space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Relation Name
                </label>
                <Input
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    placeholder="e.g. viewer"
                    className="h-8 text-sm font-mono bg-[#111921] border-slate-700"
                    disabled={disabled || isExisting}
                />
            </div>

            {/* Inherited Relations */}
            <div className="flex-1 space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Inherited Relations (Implied by)
                </label>
                <div className="flex flex-wrap pt-1 gap-2 h-8 px-1.5 rounded-md border border-slate-700 bg-[#111921]">
                    {subjects.map((sub, idx) => (
                        <SubjectBadge
                            key={idx}
                            subject={sub}
                            onRemove={() => handleRemoveSubject(idx)}
                            disabled={disabled}
                        />
                    ))}
                    <AddSubjectPopover
                        onAdd={handleAddSubject}
                        availableRelations={availableRelations}
                        disabled={disabled}
                    />
                </div>
            </div>

            {/* Hierarchy Toggle - conditionally shown */}
            {!hideHierarchy && (
                <div className="flex flex-col items-center space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider text-center w-full cursor-help" title="Allows subjects to be nested (e.g. group hierarchies)">
                        Recursive?
                    </label>
                    <div className="h-8 flex items-center justify-center">
                        <Switch
                            checked={isHierarchy}
                            onChange={(val) => !disabled && onToggleHierarchy?.(val)}
                            disabled={disabled}
                            className="scale-90"
                        />
                    </div>
                </div>
            )}

            {/* Delete Button */}
            <div className="pt-6">
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
