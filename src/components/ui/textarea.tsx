import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Label } from "./label";
import type { InputVariant } from "@/lib/types";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: InputVariant;
  label?: string;
  error?: string;
  helperText?: string;
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
 * Textarea component for multi-line text input
 * Consistent styling with Input component
 * 
 * @example
 * <Textarea 
 *   label="Description" 
 *   rows={4}
 *   placeholder="Enter description..."
 * />
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      containerClassName,
      variant = "default",
      label,
      error,
      helperText,
      required,
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = id || props.name;
    const actualVariant = error ? "error" : variant;

    return (
      <div className={cn("space-y-1", containerClassName)}>
        {label && (
          <Label htmlFor={textareaId} required={required}>
            {label}
          </Label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-sm text-white",
            "placeholder:text-gray-500",
            "focus:outline-none transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-y min-h-[80px]",
            variantStyles[actualVariant],
            className
          )}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={
            error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined
          }
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-sm text-red-400">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${textareaId}-helper`} className="text-sm text-gray-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
