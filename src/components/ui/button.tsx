import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/cn"
import { Icon } from "./icon"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-[#1773cf] text-white hover:bg-[#145ba8] focus-visible:outline-[#1773cf] disabled:bg-gray-600 disabled:cursor-not-allowed",
        secondary:
          "bg-white/10 text-gray-300 hover:bg-white/20 focus-visible:outline-white/50 disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed",
        ghost:
          "text-gray-300 bg-transparent hover:bg-white/5 focus-visible:outline-white/30 disabled:text-gray-600 disabled:cursor-not-allowed",
        danger:
          "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-500 disabled:bg-red-900 disabled:cursor-not-allowed",
        success:
          "bg-green-600 text-white hover:bg-green-700 focus-visible:outline-green-500 disabled:bg-green-900 disabled:cursor-not-allowed",
      },
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-6 text-base",
        xl: "h-12 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  leftIcon?: string
  rightIcon?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Icon name="progress_activity" className="animate-spin" size="sm" />
        ) : leftIcon ? (
          <Icon name={leftIcon} size="sm" />
        ) : null}
        {children}
        {rightIcon && !isLoading && <Icon name={rightIcon} size="sm" />}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
