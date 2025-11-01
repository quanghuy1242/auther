/**
 * OAuth authorization utilities for access control
 */

import { userClientAccessRepository, oauthClientMetadataRepository } from "@/lib/repositories";

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

    // For restricted clients, check if user has explicit access
    if (metadata.accessPolicy === "restricted") {
      const access = await userClientAccessRepository.checkAccess(userId, clientId);
      
      if (!access.hasAccess) {
        return {
          allowed: false,
          reason: "This client requires explicit access approval. Please contact an administrator.",
        };
      }

      // Check if access has expired
      if (access.isExpired) {
        return {
          allowed: false,
          reason: "Your access to this client has expired. Please contact an administrator.",
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
