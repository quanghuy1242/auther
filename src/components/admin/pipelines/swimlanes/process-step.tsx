"use client";

import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui";

interface ProcessStepProps {
    label: string;
    icon: string;
    description: string;
    color: string;
}

/**
 * Visual representation of a system process step (non-interactive).
 * Shows what the system does between hook points.
 */
export function ProcessStep({ label, icon, description, color }: ProcessStepProps) {
    const colorVariants: Record<string, string> = {
        emerald: "border-emerald-600/30 bg-emerald-950/30 text-emerald-400",
        blue: "border-blue-600/30 bg-blue-950/30 text-blue-400",
        amber: "border-amber-600/30 bg-amber-950/30 text-amber-400",
        purple: "border-purple-600/30 bg-purple-950/30 text-purple-400",
    };

    const iconColorVariants: Record<string, string> = {
        emerald: "text-emerald-500",
        blue: "text-blue-500",
        amber: "text-amber-500",
        purple: "text-purple-500",
    };

    return (
        <div
            className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border",
                "min-w-[100px] select-none",
                colorVariants[color] || colorVariants.blue
            )}
            title={description}
        >
            <Icon
                name={icon as Parameters<typeof Icon>[0]["name"]}
                size="sm"
                className={iconColorVariants[color] || iconColorVariants.blue}
            />
            <span className="text-xs font-medium whitespace-nowrap">{label}</span>
        </div>
    );
}
