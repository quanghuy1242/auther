"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAuth } from "@/lib/session";
import { auth } from "@/lib/auth";
import {
  userClientAccessRepository,
  oauthClientMetadataRepository,
} from "@/lib/repositories";
import { validatePermissions } from "@/lib/utils/permissions";
import type { ResourcePermissions } from "@/lib/utils/permissions";

// ============================================================================
// API Key Management
// ============================================================================

const createApiKeySchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  permissions: z.record(z.string(), z.array(z.string())),
  expiresInDays: z.number().min(1).max(3650).optional(), // Max 10 years
});

export interface ApiKeyResult {
  success: boolean;
  error?: string;
  apiKey?: {
    id: string;
    key: string; // Only returned on creation
    name: string;
    expiresAt: Date | null;
  };
}

/**
 * Create an API key for a client
 * This wraps Better Auth's createApiKey with our access control logic
 */
export async function createClientApiKey(
  data: z.infer<typeof createApiKeySchema>
): Promise<ApiKeyResult> {
  try {
    const session = await requireAuth();
    const validated = createApiKeySchema.parse(data);

    // 1. Check user has access to the client
    const access = await userClientAccessRepository.checkAccess(
      session.user.id,
      validated.clientId
    );

    if (!access.hasAccess) {
      return {
        success: false,
        error: "You don't have access to this client",
      };
    }

    // 2. Check if client allows API keys
    const metadata = await oauthClientMetadataRepository.findByClientId(
      validated.clientId
    );

    // For backward compatibility: if no metadata exists, client doesn't allow API keys
    // New clients need to explicitly opt-in to API key functionality
    if (!metadata || !metadata.allowsApiKeys) {
      return {
        success: false,
        error: "This client does not allow API key creation",
      };
    }

    // 3. Validate permissions against client's allowed resources
    if (metadata.allowedResources) {
      const isValid = validatePermissions(
        validated.permissions,
        metadata.allowedResources
      );

      if (!isValid) {
        return {
          success: false,
          error: "Requested permissions exceed client's allowed resources",
        };
      }
    }

    // 4. Create API key using Better Auth
    const expiresIn = validated.expiresInDays
      ? validated.expiresInDays * 24 * 60 * 60 // Convert days to seconds
      : 60 * 60 * 24 * 365; // Default: 1 year

    const result = await auth.api.createApiKey({
      body: {
        name: validated.name,
        permissions: validated.permissions,
        expiresIn,
        metadata: {
          oauth_client_id: validated.clientId,
          access_level: access.level,
        },
      },
      headers: await headers(),
    });

    if (!result) {
      return {
        success: false,
        error: "Failed to create API key",
      };
    }

    revalidatePath(`/admin/clients/${validated.clientId}`);
    revalidatePath(`/admin/clients/${validated.clientId}/api-keys`);

    return {
      success: true,
      apiKey: {
        id: result.id,
        key: result.key, // Only shown once!
        name: result.name ?? "Unnamed Key",
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
      },
    };
  } catch (error) {
    console.error("createClientApiKey error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create API key",
    };
  }
}

/**
 * List API keys for a client
 * Cached to avoid redundant fetches
 */
export const listClientApiKeys = cache(async (clientId: string) => {
  try {
    const session = await requireAuth();
    // Get headers outside of unstable_cache
    const headersList = await headers();

    return await unstable_cache(
      async (hdrs: ReturnType<typeof headers> extends Promise<infer T> ? T : never) => {
        // Check access
        const access = await userClientAccessRepository.checkAccess(
          session.user.id,
          clientId
        );

        if (!access.hasAccess) {
          return [];
        }

        // Get all user's API keys using Better Auth
        const allKeys = await auth.api.listApiKeys({
          headers: hdrs,
        });

        if (!allKeys || !Array.isArray(allKeys)) {
          return [];
        }

        // Filter keys for this specific client
        return allKeys
          .filter((key) => key.metadata?.oauth_client_id === clientId)
          .map((key) => ({
            id: key.id,
            name: key.name ?? "Unnamed Key",
            enabled: key.enabled ?? true,
            permissions: (key.permissions as ResourcePermissions) ?? {},
            expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
            createdAt: key.createdAt ? new Date(key.createdAt) : new Date(),
            metadata: key.metadata ?? {},
          }));
      },
      [`client-api-keys-${clientId}`],
      {
        revalidate: 30,
        tags: [`client-api-keys-${clientId}`, `client-${clientId}`],
      }
    )(headersList);
  } catch (error) {
    console.error("listClientApiKeys error:", error);
    return [];
  }
});

/**
 * Revoke (delete) an API key
 */
export async function revokeApiKey(keyId: string): Promise<ApiKeyResult> {
  try {
    await requireAuth();

    // Get all keys to find the one we want to delete
    // Better Auth doesn't expose getApiKey, so we list and filter
    const allKeys = await auth.api.listApiKeys({
      headers: await headers(),
    });

    const key = allKeys?.find((k) => k.id === keyId);

    if (!key) {
      return {
        success: false,
        error: "API key not found",
      };
    }

    // Verify user owns this key (implicitly owned if it's in their list)
    // Better Auth's listApiKeys only returns keys for the authenticated user

    // Delete the key
    await auth.api.deleteApiKey({
      body: { keyId },
      headers: await headers(),
    });

    // Revalidate client pages if we know the client
    const clientId = key.metadata?.oauth_client_id as string | undefined;
    if (clientId) {
      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath(`/admin/clients/${clientId}/api-keys`);
    }

    return { success: true };
  } catch (error) {
    console.error("revokeApiKey error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke API key",
    };
  }
}

/**
 * Update API key permissions
 */
export async function updateApiKeyPermissions(
  keyId: string,
  permissions: ResourcePermissions
): Promise<ApiKeyResult> {
  try {
    await requireAuth();

    // Get all keys to find the one we want to update
    const allKeys = await auth.api.listApiKeys({
      headers: await headers(),
    });

    const key = allKeys?.find((k) => k.id === keyId);

    if (!key) {
      return {
        success: false,
        error: "API key not found",
      };
    }

    // Verify ownership (implicitly owned if in user's list)

    // Get client metadata to validate permissions
    const clientId = key.metadata?.oauth_client_id as string | undefined;
    if (clientId) {
      const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
      
      if (metadata?.allowedResources) {
        const isValid = validatePermissions(permissions, metadata.allowedResources);
        if (!isValid) {
          return {
            success: false,
            error: "Requested permissions exceed client's allowed resources",
          };
        }
      }
    }

    // Update the key
    await auth.api.updateApiKey({
      body: {
        keyId,
        permissions,
      },
      headers: await headers(),
    });

    if (clientId) {
      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath(`/admin/clients/${clientId}/api-keys`);
    }

    return { success: true };
  } catch (error) {
    console.error("updateApiKeyPermissions error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update permissions",
    };
  }
}

/**
 * Verify an API key (useful for testing)
 * This calls Better Auth's verification endpoint
 */
export async function verifyApiKey(
  key: string,
  requiredPermissions?: ResourcePermissions
) {
  try {
    const result = await auth.api.verifyApiKey({
      body: {
        key,
        permissions: requiredPermissions,
      },
      headers: await headers(),
    });

    // Handle the response structure
    if (!result.valid) {
      return {
        valid: false,
        userId: null,
        permissions: {},
        metadata: null,
        error: result.error?.message,
      };
    }

    return {
      valid: true,
      userId: result.key?.userId ?? null,
      permissions: (result.key?.permissions as ResourcePermissions) ?? {},
      metadata: result.key?.metadata ?? null,
      error: null,
    };
  } catch (error) {
    console.error("verifyApiKey error:", error);
    return {
      valid: false,
      userId: null,
      permissions: {},
      metadata: null,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}
