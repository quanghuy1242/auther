import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/cn"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
  {
    variants: {
      variant: {
        default: "bg-gray-500/20 text-gray-300 border-gray-500/30",
        success: "bg-green-500/20 text-green-400 border-green-500/30",
        warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        danger: "bg-red-500/20 text-red-400 border-red-500/30",
        info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const dotVariants = cva("w-1.5 h-1.5 rounded-full", {
  variants: {
    variant: {
      default: "bg-gray-400",
      success: "bg-green-500",
      warning: "bg-yellow-500",
      danger: "bg-red-500",
      info: "bg-blue-500",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(dotVariants({ variant }))}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
