"use client";

import * as React from "react";
import { useFormContext, Controller } from "react-hook-form";
import { Checkbox, type CheckboxProps } from "@/components/ui/checkbox";

type ControlledCheckboxProps = Omit<CheckboxProps, "checked" | "onChange"> & {
  name: string;
};

/**
 * Controlled Checkbox component integrated with react-hook-form
 * 
 * @example
 * <ControlledCheckbox
 *   name="acceptTerms"
 *   label="Accept terms and conditions"
 *   description="You must accept to continue"
 * />
 */
export function ControlledCheckbox({ name, ...props }: ControlledCheckboxProps) {
  const { control } = useFormContext();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Checkbox
          {...props}
          checked={field.value || false}
          onChange={field.onChange}
        />
      )}
    />
  );
}
