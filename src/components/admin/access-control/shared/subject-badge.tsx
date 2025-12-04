"use client";

import * as React from "react";
import { Badge, Icon } from "@/components/ui";

export interface Subject {
    type: string;
    relation?: string;
}

interface SubjectBadgeProps {
    subject: Subject;
    onRemove: () => void;
}

export function SubjectBadge({ subject, onRemove }: SubjectBadgeProps) {
    return (
        <Badge variant="default" className="bg-slate-800 text-gray-300 border-slate-700 h-6 px-2 gap-1">
            <span className="font-mono text-xs">{subject.type}</span>
            {subject.relation && (
                <span className="text-gray-500 text-[10px]">#{subject.relation}</span>
            )}
            <button
                onClick={onRemove}
                className="ml-1 text-gray-500 hover:text-red-400"
            >
                <Icon name="close" className="text-[10px] font-bold" />
            </button>
        </Badge>
    );
}
