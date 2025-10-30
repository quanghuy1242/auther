"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { InputProps } from "@/components/ui/input";
import type { TextareaProps } from "@/components/ui/textarea";

type FormFieldProps = (InputProps | TextareaProps) & {
  name: string;
  multiline?: boolean;
};

/**
 * FormField component that connects react-hook-form with UI inputs
 * Automatically handles validation errors and form state
 * 
 * @example
 * <FormField name="email" label="Email Address" type="email" required />
 * <FormField name="description" label="Description" multiline rows={4} />
 */
export function FormField({ name, multiline, ...props }: FormFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const error = errors[name]?.message as string | undefined;

  if (multiline) {
    return (
      <Textarea
        {...(props as TextareaProps)}
        {...register(name)}
        error={error}
      />
    );
  }

  return (
    <Input
      {...(props as InputProps)}
      {...register(name)}
      error={error}
    />
  );
}
