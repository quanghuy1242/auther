"use client";

import * as React from "react";

export interface SectionHeaderProps {
    title: string;
    description?: string;
    action?: React.ReactNode;
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <h3 className="text-base font-medium text-white">{title}</h3>
                {description && <p className="text-sm text-gray-400">{description}</p>}
            </div>
            {action && <div>{action}</div>}
        </div>
    );
}
