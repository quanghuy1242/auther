"use client";

import * as React from "react";
import { Button, Icon, Input, Popover, PopoverTrigger, PopoverContent } from "@/components/ui";
import type { Subject } from "./subject-badge";

interface AddSubjectPopoverProps {
    onAdd: (subject: Subject) => void;
    disabled?: boolean;
}

export function AddSubjectPopover({ onAdd, disabled }: AddSubjectPopoverProps) {
    const [type, setType] = React.useState("");
    const [relation, setRelation] = React.useState("");
    const [isOpen, setIsOpen] = React.useState(false);

    const handleAdd = () => {
        if (type.trim()) {
            onAdd({ type: type.trim(), relation: relation.trim() || undefined });
            setType("");
            setRelation("");
            setIsOpen(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    disabled={disabled}
                    className="text-xs text-primary hover:text-blue-400 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon name="add" className="text-[14px]" />
                    <span className="font-medium">Add</span>
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 bg-[#1A2530] border-[#243647]">
                <div className="space-y-3">
                    <h5 className="text-xs font-medium text-white mb-2">Add Allowed Subject</h5>
                    <div className="space-y-2">
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Type</label>
                            <Input
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="e.g. user, group"
                                className="h-7 text-xs"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 block mb-1">Relation (Optional)</label>
                            <Input
                                value={relation}
                                onChange={(e) => setRelation(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="e.g. member"
                                className="h-7 text-xs"
                            />
                        </div>
                        <Button size="xs" className="w-full" onClick={handleAdd} disabled={!type.trim()}>
                            Add Subject
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
