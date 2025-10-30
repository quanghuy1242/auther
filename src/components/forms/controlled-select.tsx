"use client";

import * as React from "react";
import { useFormContext, Controller } from "react-hook-form";
import { Select, type SelectProps } from "@/components/ui/select";

type ControlledSelectProps = Omit<SelectProps, "value" | "onChange"> & {
  name: string;
};

/**
 * Controlled Select component integrated with react-hook-form
 * 
 * @example
 * <ControlledSelect
 *   name="role"
 *   label="User Role"
 *   options={[
 *     { value: 'viewer', label: 'Viewer' },
 *     { value: 'admin', label: 'Admin' },
 *   ]}
 * />
 */
export function ControlledSelect({ name, ...props }: ControlledSelectProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext();

  const error = errors[name]?.message as string | undefined;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Select
          {...props}
          value={field.value}
          onChange={field.onChange}
          error={error}
        />
      )}
    />
  );
}
