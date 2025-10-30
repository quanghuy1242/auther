"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = Omit<ButtonProps, "type" | "isLoading">;

/**
 * SubmitButton component with automatic loading state from useFormStatus
 * Shows loading spinner when form is submitting
 * 
 * @example
 * <SubmitButton variant="primary">Create User</SubmitButton>
 */
export function SubmitButton({ children, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      isLoading={pending}
      {...props}
    >
      {children}
    </Button>
  );
}
