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

export type ProviderConfig = {
  id: string;
  name: string;
  icon: string;
};

export const PROVIDERS: Record<string, ProviderConfig> = {
  google: { id: "google", name: "Google", icon: "https://www.google.com/favicon.ico" },
  github: { id: "github", name: "GitHub", icon: "https://github.com/favicon.ico" },
  credential: { id: "credential", name: "Email/Password", icon: "mail" },
};

export function getProviderConfig(providerId: string): ProviderConfig {
  return PROVIDERS[providerId] || { id: providerId, name: providerId, icon: "key" };
}
