import { z } from "zod";

export interface ClientMetadata {
  accessPolicy: "all_users" | "restricted";
  allowsApiKeys: boolean;
  allowedResources: Record<string, string[]> | null;
  defaultApiKeyPermissions: Record<string, string[]> | null;
}

export const updateClientPolicySchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  accessPolicy: z.enum(["all_users", "restricted"]),
  allowsApiKeys: z.boolean().optional(),
  allowedResources: z.record(z.string(), z.array(z.string())).optional(),
  defaultApiKeyPermissions: z.record(z.string(), z.array(z.string())).optional(),
});
