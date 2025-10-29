"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";

export interface FormWrapperProps<TSchema> {
  schema: ZodType<TSchema>;
  action: (prevState: any, formData: FormData) => Promise<any>;
  children: React.ReactNode;
  onSuccess?: (data: any) => void;
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
