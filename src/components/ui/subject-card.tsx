"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { SubjectAvatar } from "@/components/ui/subject-avatar";

export interface SubjectCardProps {
    subject: {
        name: string;
        type: "User" | "Group" | "ApiKey";
        description?: string;
        avatarUrl?: string;
    };
    onRemove?: () => void;
    className?: string;
}

export function SubjectCard({ subject, onRemove, className = "" }: SubjectCardProps) {
    return (
        <div className={`flex items-center justify-between p-3 rounded-lg border border-primary/50 bg-primary/10 ${className}`}>
            <div className="flex items-center gap-3">
                <SubjectAvatar type={subject.type} avatarUrl={subject.avatarUrl} />
                <div className="flex flex-col">
                    <span className="text-sm font-medium text-white">
                        {subject.name}
                    </span>
                    {subject.description && (
                        <span className="text-xs text-gray-400">
                            {subject.description}
                        </span>
                    )}
                </div>
            </div>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-slate-400 hover:text-white"
                >
                    <Icon name="close" />
                </button>
            )}
        </div>
    );
}
