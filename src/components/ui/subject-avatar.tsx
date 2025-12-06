"use client";

import * as React from "react";
import { Icon } from "@/components/ui/icon";

export interface SubjectAvatarProps {
    type: "User" | "Group" | "ApiKey";
    avatarUrl?: string;
    className?: string;
}

/**
 * SubjectAvatar component
 * Renders an avatar icon for User, Group, or ApiKey subjects.
 */
export function SubjectAvatar({ type, avatarUrl, className = "" }: SubjectAvatarProps) {
    if (type === "Group") {
        return (
            <div className={`flex items-center justify-center rounded-full size-8 bg-slate-700 text-slate-400 ${className}`}>
                <Icon name="group" className="text-lg" />
            </div>
        );
    }

    if (type === "ApiKey") {
        return (
            <div className={`flex items-center justify-center rounded-full size-8 bg-amber-900/30 text-amber-500 ${className}`}>
                <Icon name="key" className="text-lg" />
            </div>
        );
    }

    // User type
    return (
        <div
            className={`bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 bg-slate-800 ${className}`}
            style={{
                backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined,
            }}
        >
            {!avatarUrl && (
                <Icon name="person" className="text-gray-500 w-full h-full p-1" />
            )}
        </div>
    );
}
