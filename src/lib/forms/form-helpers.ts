"use client";

import { useForm, UseFormProps, FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

/**
 * Custom hook that wraps react-hook-form with Zod validation
 * Automatically configures the Zod resolver for type-safe form validation
 * 
 * @example
 * const form = useZodForm(loginSchema, {
 *   defaultValues: { email: "", password: "" }
 * });
 */
export function useZodForm<TFieldValues extends FieldValues = FieldValues>(
  schema: ZodType<TFieldValues>,
  props?: Omit<UseFormProps<TFieldValues>, "resolver">
) {
  return useForm<TFieldValues>({
    ...props,
    // @ts-expect-error - Zod version mismatch between v3 and v4
    resolver: zodResolver(schema),
  });
}
