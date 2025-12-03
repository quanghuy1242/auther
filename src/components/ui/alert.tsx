import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/cn"
import { Icon } from "./icon"

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-4 text-sm flex gap-3",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-red-500/50 text-red-500 dark:border-red-500 [&>svg]:text-red-500",
        info: "bg-blue-500/10 border-blue-500/30 text-blue-400 [&>svg]:text-blue-400",
        warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400 [&>svg]:text-yellow-400",
        error: "bg-red-500/10 border-red-500/30 text-red-400 [&>svg]:text-red-400",
        success: "bg-green-500/10 border-green-500/30 text-green-400 [&>svg]:text-green-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const iconMap: Record<string, string> = {
  info: "info",
  warning: "warning",
  error: "error",
  success: "check_circle",
  destructive: "error",
  default: "info",
}

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants> & { onClose?: () => void, title?: string }
>(({ className, variant = "info", title, children, onClose, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  >
    <div className="flex-shrink-0 mt-0.5">
      <Icon name={iconMap[variant || "default"] || "info"} size="sm" className="h-5 w-5" />
    </div>
    <div className="flex-1">
        {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
        <div className="text-sm [&_p]:leading-relaxed">{children}</div>
    </div>
    {onClose && (
      <button
        onClick={onClose}
        className="flex-shrink-0 ml-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <Icon name="close" size="sm" className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
    )}
  </div>
))
Alert.displayName = "Alert"

export { Alert, alertVariants }
