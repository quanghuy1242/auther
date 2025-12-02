import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

export interface EmptyStateProps {
  icon?: string;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon = "info",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("text-center py-12 text-gray-400 flex flex-col items-center justify-center", className)}>
      {icon && <Icon name={icon} className="text-4xl mb-3 opacity-50" />}
      {title && <h3 className="text-lg font-medium text-white mb-1">{title}</h3>}
      {description && <p className="text-sm text-gray-400 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
