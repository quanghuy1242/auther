import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

/**
 * Label component for form fields
 * Displays an asterisk indicator for required fields
 * 
 * @example
 * <Label htmlFor="email" required>Email Address</Label>
 */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn(
          "block text-sm font-medium text-gray-200",
          className
        )}
        {...props}
      >
        {children}
        {required && (
          <span className="ml-1 text-red-400" aria-label="required">
            *
          </span>
        )}
      </label>
    );
  }
);

Label.displayName = "Label";
