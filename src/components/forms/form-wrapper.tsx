"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

interface FormState {
  success: boolean;
  errors?: Record<string, string>;
  data?: unknown;
}

export interface FormWrapperProps<TSchema> {
  schema: ZodType<TSchema>;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  onSuccess?: (data: unknown) => void;
  className?: string;
}

/**
 * FormWrapper integrates react-hook-form with Next.js server actions
 * Provides client-side validation with Zod and syncs with server errors
 * 
 * @example
 * <FormWrapper schema={loginSchema} action={loginAction}>
 *   <FormField name="email" label="Email" />
 *   <FormField name="password" label="Password" type="password" />
 *   <SubmitButton>Sign In</SubmitButton>
 * </FormWrapper>
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function FormWrapper<TSchema extends Record<string, any>>({
  schema,
  action,
  children,
  onSuccess,
  className,
}: FormWrapperProps<TSchema>) {
  const [state, formAction] = useFormState(action, { success: false });
  const methods = useForm<TSchema>({
    // @ts-expect-error - Zod version mismatch
    resolver: zodResolver(schema),
  });

  // Sync server validation errors with client form
  React.useEffect(() => {
    if (state.errors) {
      Object.entries(state.errors).forEach(([field, message]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        methods.setError(field as any, { message: message as string });
      });
    }
    if (state.success && onSuccess) {
      onSuccess(state.data);
      methods.reset();
    }
  }, [state, methods, onSuccess]);

  return (
    <FormProvider {...methods}>
      <form 
        action={formAction} 
        onSubmit={methods.handleSubmit(() => {})}
        className={className}
      >
        {children}
      </form>
    </FormProvider>
  );
}
