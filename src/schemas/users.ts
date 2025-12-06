import { z } from "zod";
import { booleanField } from "@/lib/utils/validation";

export const createUserSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  username: z.string().optional().transform(val => val || undefined),
  password: z.string().optional().transform(val => val || undefined),
  sendInvite: booleanField.optional().default(false),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .optional()
    .or(z.literal("")),
  displayUsername: z
    .string()
    .min(2, "Display username must be at least 2 characters")
    .optional()
    .or(z.literal("")),
});
