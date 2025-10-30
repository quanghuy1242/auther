import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icon";
import type { ButtonVariant, Size } from "@/lib/types";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: string;
  rightIcon?: string;
  asChild?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: cn(
    "bg-[#1773cf] text-white",
    "hover:bg-[#145ba8]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1773cf]",
    "disabled:bg-gray-600 disabled:cursor-not-allowed"
  ),
  secondary: cn(
    "bg-white/10 text-gray-300",
    "hover:bg-white/20",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50",
    "disabled:bg-white/5 disabled:text-gray-500 disabled:cursor-not-allowed"
  ),
  ghost: cn(
    "text-gray-300 bg-transparent",
    "hover:bg-white/5",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30",
    "disabled:text-gray-600 disabled:cursor-not-allowed"
  ),
  danger: cn(
    "bg-red-600 text-white",
    "hover:bg-red-700",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500",
    "disabled:bg-red-900 disabled:cursor-not-allowed"
  ),
  success: cn(
    "bg-green-600 text-white",
    "hover:bg-green-700",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500",
    "disabled:bg-green-900 disabled:cursor-not-allowed"
  ),
};

const sizeStyles: Record<Size, string> = {
  xs: "h-7 px-2 text-xs",
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
  xl: "h-12 px-8 text-base",
};

/**
 * Button component with multiple variants and sizes
 * Supports loading states and icon integration
 * 
 * @example
 * <Button variant="primary" leftIcon="add">Create User</Button>
 * <Button variant="danger" isLoading>Delete</Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          "rounded-lg font-semibold",
          "transition-colors duration-200",
          "disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Icon name="progress_activity" className="animate-spin" size="sm" />
        ) : leftIcon ? (
          <Icon name={leftIcon} size="sm" />
        ) : null}
        {children}
        {rightIcon && !isLoading && <Icon name={rightIcon} size="sm" />}
      </button>
    );
  }
);

Button.displayName = "Button";
