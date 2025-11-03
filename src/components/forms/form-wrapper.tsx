"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils/cn";
import { useTransition } from "react";

interface FormState {
  success: boolean;
  errors?: Record<string, string>;
  data?: unknown;
  error?: string;
}

export interface FormWrapperProps<TSchema> {
  schema: ZodType<TSchema>;
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  onSuccess?: (data: unknown) => void;
  className?: string;
  defaultValues?: Partial<TSchema>;
  resetOnSuccess?: boolean; // New prop to control reset behavior
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
  defaultValues,
  resetOnSuccess = true, // Default to true for backward compatibility
}: FormWrapperProps<TSchema>) {
  const [state, formAction] = useFormState(action, { success: false });
  const [, startTransition] = useTransition();
  const methods = useForm<TSchema>({
    // @ts-expect-error - Zod version mismatch
    resolver: zodResolver(schema),
    // @ts-expect-error - DefaultValues type mismatch
    defaultValues,
    mode: "onBlur", // Validate on blur for better UX - shows errors after user leaves field
    reValidateMode: "onChange", // Re-validate on change after first submission
  });

  // Use ref to avoid re-triggering effect when onSuccess changes
  const onSuccessRef = React.useRef(onSuccess);
  const processedStateRef = React.useRef<FormState | null>(null);
  
  React.useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Sync server validation errors with client form
  React.useEffect(() => {
    // Prevent processing the same state multiple times
    if (processedStateRef.current === state) {
      return;
    }
    
    if (state.errors) {
      Object.entries(state.errors).forEach(([field, message]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        methods.setError(field as any, { message: message as string });
      });
    }
    if (state.success && onSuccessRef.current) {
      processedStateRef.current = state; // Mark this state as processed
      onSuccessRef.current(state.data);
      // Only reset form if resetOnSuccess is true
      // For edit forms, we typically don't want to reset
      if (resetOnSuccess) {
        if (defaultValues) {
          methods.reset(defaultValues as never);
        } else {
          methods.reset();
        }
      }
    }
  }, [state, methods, defaultValues, resetOnSuccess]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Capture the form element before any async operations
    const form = e.currentTarget;
    
    // Validate with react-hook-form first
    const isValid = await methods.trigger();
    
    if (isValid) {
      // If valid, call formAction inside startTransition
      const formData = new FormData(form);
      startTransition(() => {
        formAction(formData);
      });
    } else {
      // Scroll to first error
      const firstErrorField = Object.keys(methods.formState.errors)[0];
      if (firstErrorField) {
        const element = form.querySelector(`[name="${firstErrorField}"]`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  return (
    <FormProvider {...methods}>
      <form 
        action={formAction} 
        onSubmit={handleSubmit}
        className={className}
      >
        {/* Display server-level error messages */}
        {!state.success && state.error && (
          <div
            className={cn(
              "mb-6 p-4 rounded-lg border",
              "bg-red-500/10 border-red-500/20 text-sm text-red-300"
            )}
            role="alert"
          >
            {state.error}
          </div>
        )}
        {/* Display form-level errors */}
        {Object.keys(methods.formState.errors).length > 0 && (
          <div 
            className={cn(
              "mb-6 p-4 rounded-lg border",
              "bg-red-500/10 border-red-500/20"
            )}
            role="alert"
          >
            <div className="flex items-start gap-3">
              <Icon name="error" className="text-red-500 text-xl shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-400 mb-2">
                  Please fix the following errors:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-300">
                  {Object.entries(methods.formState.errors).map(([field, error]) => (
                    <li key={field}>
                      <span className="font-medium capitalize">
                        {field.replace(/([A-Z])/g, ' $1').trim()}:
                      </span>{' '}
                      {error?.message as string}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        {children}
      </form>
    </FormProvider>
  );
}
