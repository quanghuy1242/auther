"use client";

import * as React from "react";
import { useFormContext, Controller } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";

interface ControlledCheckboxProps {
  name: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Controlled Checkbox component integrated with react-hook-form
 * Uses the toggle-style Checkbox for on/off states (webhooks, settings, etc.)
 * 
 * @example
 * <ControlledCheckbox
 *   name="acceptTerms"
 *   label="Accept terms and conditions"
 *   description="You must accept to continue"
 * />
 */
export function ControlledCheckbox({ name, label, description, disabled, className }: ControlledCheckboxProps) {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const rawValue = field.value;
        const checked =
          typeof rawValue === "boolean"
            ? rawValue
            : typeof rawValue === "string"
              ? ["true", "1", "on", "yes"].includes(rawValue.toLowerCase())
              : false;

        return (
          <>
            {/* Hidden input for form submission */}
            <input
              type="hidden"
              name={name}
              ref={field.ref}
              value={checked ? "true" : "false"}
            />
            <Checkbox
              checked={checked}
              onChange={(value) => {
                field.onChange(value);
              }}
              label={label}
              description={description}
              disabled={disabled}
              className={className}
            />
          </>
        );
      }}
    />
  );
}
