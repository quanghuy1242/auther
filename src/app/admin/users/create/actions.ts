"use server";

import { z } from "zod";

const createUserSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["viewer", "editor", "admin"], "Please select a role"),
  sendWelcomeEmail: z.boolean().optional(),
});

export type CreateUserState = {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  data?: unknown;
};

export async function createUser(
  prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  const rawData = {
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    role: formData.get("role"),
    sendWelcomeEmail: formData.get("sendWelcomeEmail") === "true",
  };

  const result = createUserSchema.safeParse(rawData);

  if (!result.success) {
    const errors: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        errors[issue.path[0].toString()] = issue.message;
      }
    });
    return { success: false, errors };
  }

  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Simulate success
  return {
    success: true,
    data: result.data,
  };
}
