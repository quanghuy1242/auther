import { z } from "zod";

export const updateClientPolicySchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  accessPolicy: z.enum(["all_users", "restricted"]),
  allowsApiKeys: z.boolean().optional(),
  allowedResources: z.record(z.string(), z.array(z.string())).optional(),
  defaultApiKeyPermissions: z.record(z.string(), z.array(z.string())).optional(),
});

export const registerClientSchema = z.object({
  name: z.string().min(2, "Client name must be at least 2 characters"),
  type: z.enum(["web", "spa", "native"], "Please select a client type"),
  redirectURLs: z.string().min(1, "At least one redirect URL is required"),
  trusted: z.boolean().optional(),
  grantTypes: z.string().optional(),
  tokenEndpointAuthMethod: z.enum(["client_secret_basic", "client_secret_post", "none"], "Invalid auth method"),
});

export const updateClientSchema = z.object({
  name: z.string().min(2, "Client name must be at least 2 characters"),
  redirectURLs: z.string().min(1, "At least one redirect URL is required"),
  authMethod: z.string().optional(),
  grantTypes: z.string().optional(),
});

export const clientMetadataSchema = z.object({
  accessPolicy: z.enum(["all_users", "restricted"]),
  allowsApiKeys: z.boolean(),
  allowedResources: z.record(z.string(), z.array(z.string())).nullable(),
  defaultApiKeyPermissions: z.record(z.string(), z.array(z.string())).nullable(),
});

export type ClientMetadata = z.infer<typeof clientMetadataSchema>;