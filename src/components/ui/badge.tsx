import * as React from "react";
import { cn } from "@/lib/utils/cn";
import type { BadgeVariant } from "@/lib/types";

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  success: "bg-green-500/20 text-green-400 border-green-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  danger: "bg-red-500/20 text-red-400 border-red-500/30",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const dotStyles: Record<BadgeVariant, string> = {
  default: "bg-gray-400",
  success: "bg-green-500",
  warning: "bg-yellow-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
};

/**
 * Badge component for status indicators and labels
 * Supports optional dot indicator for visual emphasis
 * 
 * @example
 * <Badge variant="success" dot>Active</Badge>
 * <Badge variant="danger">Inactive</Badge>
 */
export function Badge({ 
  variant = "default", 
  dot = false, 
  className, 
  children 
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        "px-2 py-0.5 rounded-full",
        "text-xs font-medium",
        "border",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotStyles[variant]
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
