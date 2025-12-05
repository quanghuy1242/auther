/**
 * OAuth authorization utilities for access control
 * 
 * Updated to use ReBAC tuples instead of legacy userClientAccess table.
 */

import { oauthClientMetadataRepository } from "@/lib/repositories";

/**
 * Check if a user has permission to authorize with a specific OAuth client
 * Enforces client access policies defined in oauthClientMetadata
 *
 * @param userId - The user ID from the session
 * @param clientId - The OAuth client ID being authorized
 * @returns Promise<{ allowed: boolean; reason?: string }>
 */
export async function checkOAuthClientAccess(
  userId: string,
  clientId: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get client metadata to check access policy
    const metadata = await oauthClientMetadataRepository.findByClientId(clientId);

    // If no metadata exists, or policy is "all_users", allow access
    if (!metadata || metadata.accessPolicy === "all_users") {
      return { allowed: true };
    }

    // For restricted clients, check if user has platform access via ReBAC tuples
    if (metadata.accessPolicy === "restricted") {
      const { PermissionService } = await import("@/lib/auth/permission-service");
      const permissionService = new PermissionService();
      const accessLevel = await permissionService.getPlatformAccessLevel(userId, clientId);

      if (!accessLevel) {
        return {
          allowed: false,
          reason: "This client requires explicit access approval. Please contact an administrator.",
        };
      }

      return { allowed: true };
    }

    // Default: deny if policy is not recognized
    return {
      allowed: false,
      reason: "Unknown access policy for this client.",
    };
  } catch (error) {
    console.error("Error checking OAuth client access:", error);
    return {
      allowed: false,
      reason: "An error occurred while checking access permissions.",
    };
  }
}
