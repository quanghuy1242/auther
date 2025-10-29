import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Label } from "./label";
import { Icon } from "./icon";
import type { InputVariant } from "@/lib/types";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: string;
  rightIcon?: string;
  containerClassName?: string;
}

const variantStyles: Record<InputVariant, string> = {
  default: cn(
    "border-gray-700 bg-gray-900",
    "focus:border-white focus:ring-2 focus:ring-white/40"
  ),
  error: cn(
    "border-red-500 bg-gray-900",
    "focus:border-red-400 focus:ring-2 focus:ring-red-400/40"
  ),
  success: cn(
    "border-green-500 bg-gray-900",
    "focus:border-green-400 focus:ring-2 focus:ring-green-400/40"
  ),
};

/**
 * Input component with label, error states, and icon support
 * Extracted styling from email-sign-in-form.tsx with enhancements
 * 
 * @example
 * <Input 
 *   label="Email Address" 
 *   type="email" 
 *   placeholder="user@example.com"
 *   error={errors.email}
 * />
 * <Input leftIcon="search" placeholder="Search..." />
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      variant = "default",
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      required,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;
    const actualVariant = error ? "error" : variant;

    return (
      <div className={cn("space-y-1", containerClassName)}>
        {label && (
          <Label htmlFor={inputId} required={required}>
            {label}
          </Label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Icon name={leftIcon} size="sm" className="text-gray-400" />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-sm text-white",
              "placeholder:text-gray-500",
              "focus:outline-none transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-50",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              variantStyles[actualVariant],
              className
            )}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Icon name={rightIcon} size="sm" className="text-gray-400" />
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-red-400">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="text-sm text-gray-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
