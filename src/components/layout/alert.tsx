import * as React from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";

export interface AlertProps {
  variant?: "info" | "warning" | "error" | "success";
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

const variantStyles = {
  info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  error: "bg-red-500/10 border-red-500/30 text-red-400",
  success: "bg-green-500/10 border-green-500/30 text-green-400",
};

const iconMap = {
  info: "info",
  warning: "warning",
  error: "error",
  success: "check_circle",
};

/**
 * Alert component for displaying important messages
 * 
 * @example
 * <Alert variant="warning" title="Warning" onClose={() => {}}>
 *   System maintenance scheduled for tonight
 * </Alert>
 */
export function Alert({ variant = "info", title, children, onClose, className }: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        variantStyles[variant],
        className
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon name={iconMap[variant]} size="sm" className="mt-0.5 flex-shrink-0 self-center" />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className="text-sm font-semibold mb-1">{title}</h4>
          )}
          <div className="text-sm">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Icon name="close" size="sm" />
          </button>
        )}
      </div>
    </div>
  );
}
