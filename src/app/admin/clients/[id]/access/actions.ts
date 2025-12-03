"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requireAuth } from "@/lib/session";
import { auth } from "@/lib/auth";
import {
  userClientAccessRepository,
  oauthClientMetadataRepository,
  userGroupRepository,
} from "@/lib/repositories";
import { isValidAccessLevel } from "@/lib/utils/access-control";
import type { AccessLevel } from "@/lib/utils/access-control";
import { updateClientPolicySchema } from "../../types";

// ============================================================================
// User Access Management
// ============================================================================

const assignUserSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  clientId: z.string().min(1, "Client ID is required"),
  accessLevel: z.enum(["use", "admin"]),
  expiresInDays: z.number().optional(),
});

export interface AssignUserResult {
  success: boolean;
  error?: string;
}

/**
 * Assign a user to a client with specific access level
 */
export async function assignUserToClient(
  data: z.infer<typeof assignUserSchema>
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    const validated = assignUserSchema.parse(data);

    // Check if assignment already exists
    const existing = await userClientAccessRepository.findByUserAndClient(
      validated.userId,
      validated.clientId
    );

    if (existing) {
      return {
        success: false,
        error: "User already has access to this client. Use update instead.",
      };
    }

    // Calculate expiration date if provided
    const expiresAt = validated.expiresInDays
      ? new Date(Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    // Create access record
    await userClientAccessRepository.create({
      userId: validated.userId,
      clientId: validated.clientId,
      accessLevel: validated.accessLevel,
      expiresAt,
    });

    return { success: true };
  } catch (error) {
    console.error("assignUserToClient error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to assign user",
    };
  }
}

/**
 * Remove a user's access to a client
 */
export async function removeUserFromClient(
  userId: string,
  clientId: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    const access = await userClientAccessRepository.findByUserAndClient(
      userId,
      clientId
    );

    if (!access) {
      return {
        success: false,
        error: "User does not have access to this client",
      };
    }

    const success = await userClientAccessRepository.delete(access.id);

    if (!success) {
      return {
        success: false,
        error: "Failed to remove user access",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("removeUserFromClient error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove user",
    };
  }
}

/**
 * Update a user's access level or expiration
 */
export async function updateUserAccess(
  userId: string,
  clientId: string,
  data: { accessLevel?: AccessLevel; expiresInDays?: number | null }
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    const access = await userClientAccessRepository.findByUserAndClient(
      userId,
      clientId
    );

    if (!access) {
      return {
        success: false,
        error: "User does not have access to this client",
      };
    }

    // Validate access level if provided
    if (data.accessLevel && !isValidAccessLevel(data.accessLevel)) {
      return {
        success: false,
        error: "Invalid access level",
      };
    }

    // Calculate new expiration date
    let expiresAt: Date | null | undefined;
    if (data.expiresInDays !== undefined) {
      expiresAt = data.expiresInDays === null
        ? null
        : new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000);
    }

    const updated = await userClientAccessRepository.update(access.id, {
      accessLevel: data.accessLevel,
      expiresAt,
    });

    if (!updated) {
      return {
        success: false,
        error: "Failed to update user access",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("updateUserAccess error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update access",
    };
  }
}

/**
 * Get all users with access to a client
 * Returns enriched data with user details
 */
export async function getClientUsers(clientId: string) {
  try {
    await requireAuth();
    
    const accessList = await userClientAccessRepository.findByClient(clientId);
    
    // Fetch user details for each access record
    const { user } = await import("@/db/schema");
    const { db } = await import("@/lib/db");
    const { inArray } = await import("drizzle-orm");
    
    if (accessList.length === 0) return [];
    
    const userIds = accessList.map((a) => a.userId);
    const users = await db.select().from(user).where(inArray(user.id, userIds));
    
    // Create a map for quick lookup
    const userMap = new Map(users.map((u) => [u.id, u]));
    
    // Merge access data with user data
    return accessList.map((access) => {
      const userData = userMap.get(access.userId);
      return {
        userId: access.userId,
        userName: userData?.name ?? null,
        userEmail: userData?.email ?? "unknown@example.com",
        accessLevel: access.accessLevel,
        expiresAt: access.expiresAt,
        createdAt: access.createdAt,
      };
    });
  } catch (error) {
    console.error("getClientUsers error:", error);
    return [];
  }
}

// ============================================================================
// Client Metadata & Access Policy
// ============================================================================

/**
 * Update client's access policy and metadata
 */
export async function updateClientAccessPolicy(
  data: z.infer<typeof updateClientPolicySchema>
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    const validated = updateClientPolicySchema.parse(data);

    // Find or create metadata
    let metadata = await oauthClientMetadataRepository.findByClientId(
      validated.clientId
    );

    if (!metadata) {
      // Create new metadata
      metadata = await oauthClientMetadataRepository.create({
        clientId: validated.clientId,
        accessPolicy: validated.accessPolicy,
        allowsApiKeys: validated.allowsApiKeys,
        allowedResources: validated.allowedResources,
        defaultApiKeyPermissions: validated.defaultApiKeyPermissions,
      });
    } else {
      // Update existing metadata
      const updated = await oauthClientMetadataRepository.update(
        validated.clientId,
        {
          accessPolicy: validated.accessPolicy,
          allowsApiKeys: validated.allowsApiKeys,
          allowedResources: validated.allowedResources,
          defaultApiKeyPermissions: validated.defaultApiKeyPermissions,
        }
      );

      if (!updated) {
        return {
          success: false,
          error: "Failed to update client metadata",
        };
      }
    }

    return { success: true };
  } catch (error) {
    console.error("updateClientAccessPolicy error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update policy",
    };
  }
}

/**
 * Get client's metadata with backward compatibility
 * For existing clients without metadata, returns safe defaults (no restriction mode)
 */
export async function getClientMetadata(clientId: string) {
  try {
    await requireAuth();
    
    const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
    
    // If no metadata exists (existing clients), return defaults
    // This ensures backward compatibility - clients work in "all_users" mode by default
    if (!metadata) {
      return {
        accessPolicy: "all_users" as const,
        allowsApiKeys: false,
        allowedResources: null,
        defaultApiKeyPermissions: null,
      };
    }
    
    // Return existing metadata in the format expected by UI
    return {
      accessPolicy: metadata.accessPolicy,
      allowsApiKeys: metadata.allowsApiKeys,
      allowedResources: metadata.allowedResources,
      defaultApiKeyPermissions: metadata.defaultApiKeyPermissions,
    };
  } catch (error) {
    console.error("getClientMetadata error:", error);
    // Return safe defaults on error
    return {
      accessPolicy: "all_users" as const,
      allowsApiKeys: false,
      allowedResources: null,
      defaultApiKeyPermissions: null,
    };
  }
}

/**
 * Check if resources/actions are in use by API keys or default permissions
 * Returns the API keys that would be affected by removing these resources
 */
export async function checkResourceDependencies(
  clientId: string,
  proposedResources: Record<string, string[]>
): Promise<{
  hasConflicts: boolean;
  affectedKeys: Array<{
    keyId: string;
    keyName: string;
    conflictingPermissions: string[];
  }>;
  defaultPermissionConflicts: string[];
}> {
  try {
    await requireAuth();
    const _headers = await headers();

    // Get client metadata to check default permissions
    const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
    const defaultPermissionConflicts: string[] = [];

    // Check default permissions
    if (metadata?.defaultApiKeyPermissions) {
      for (const [resource, actions] of Object.entries(metadata.defaultApiKeyPermissions)) {
        const proposedActions = proposedResources[resource];

        if (!proposedActions) {
          // Resource is being removed entirely
          for (const action of actions) {
            defaultPermissionConflicts.push(`${resource}:${action}`);
          }
        } else {
          // Check if any actions are being removed
          for (const action of actions) {
            if (!proposedActions.includes(action)) {
              defaultPermissionConflicts.push(`${resource}:${action}`);
            }
          }
        }
      }
    }

    // Get all API keys for this client
    const allKeys = await auth.api.listApiKeys({
      headers: _headers,
    });

    if (!allKeys || !Array.isArray(allKeys)) {
      return {
        hasConflicts: defaultPermissionConflicts.length > 0,
        affectedKeys: [],
        defaultPermissionConflicts,
      };
    }

    // Filter keys for this specific client
    const clientKeys = allKeys.filter(
      (key) => key.metadata?.oauth_client_id === clientId
    );

    const affectedKeys: Array<{
      keyId: string;
      keyName: string;
      conflictingPermissions: string[];
    }> = [];

    // Check each key's permissions against proposed resources
    for (const key of clientKeys) {
      const keyPermissions = (key.permissions || {}) as Record<string, string[]>;
      const conflictingPermissions: string[] = [];

      for (const [resource, actions] of Object.entries(keyPermissions)) {
        const proposedActions = proposedResources[resource];

        if (!proposedActions) {
          // Resource is being removed entirely
          for (const action of actions) {
            conflictingPermissions.push(`${resource}:${action}`);
          }
        } else {
          // Check if any actions are being removed
          for (const action of actions) {
            if (!proposedActions.includes(action)) {
              conflictingPermissions.push(`${resource}:${action}`);
            }
          }
        }
      }

      if (conflictingPermissions.length > 0) {
        affectedKeys.push({
          keyId: key.id,
          keyName: key.name ?? "Unnamed Key",
          conflictingPermissions,
        });
      }
    }

    return {
      hasConflicts: affectedKeys.length > 0 || defaultPermissionConflicts.length > 0,
      affectedKeys,
      defaultPermissionConflicts,
    };
  } catch (error) {
    console.error("checkResourceDependencies error:", error);
    return {
      hasConflicts: false,
      affectedKeys: [],
      defaultPermissionConflicts: [],
    };
  }
}

// ============================================================================
// User Group Management
// ============================================================================

const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters"),
  description: z.string().optional(),
});

/**
 * Create a new user group
 */
export async function createUserGroup(
  data: z.infer<typeof createGroupSchema>
): Promise<AssignUserResult & { groupId?: string }> {
  try {
    await requireAuth();

    const validated = createGroupSchema.parse(data);

    // Check if group name already exists
    const existing = await userGroupRepository.findByName(validated.name);
    if (existing) {
      return {
        success: false,
        error: "A group with this name already exists",
      };
    }

    const group = await userGroupRepository.create({
      name: validated.name,
      description: validated.description,
    });

    return { success: true, groupId: group.id };
  } catch (error) {
    console.error("createUserGroup error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create group",
    };
  }
}

/**
 * Add a user to a group
 */
export async function addUserToGroup(
  userId: string,
  groupId: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    // Check if user is already in group
    const groups = await userGroupRepository.getUserGroups(userId);
    if (groups.some((g) => g.id === groupId)) {
      return {
        success: false,
        error: "User is already in this group",
      };
    }

    await userGroupRepository.addMember(groupId, userId);

    return { success: true };
  } catch (error) {
    console.error("addUserToGroup error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add user to group",
    };
  }
}

/**
 * Remove a user from a group
 */
export async function removeUserFromGroup(
  userId: string,
  groupId: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    await userGroupRepository.removeMember(groupId, userId);

    return { success: true };
  } catch (error) {
    console.error("removeUserFromGroup error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to remove user from group",
    };
  }
}

/**
 * Get all groups with member counts
 */
export async function getAllGroups() {
  try {
    await requireAuth();
    
    const groups = await userGroupRepository.findAll();
    
    // Add member counts
    const groupsWithCounts = await Promise.all(
      groups.map(async (group) => {
        const members = await userGroupRepository.getMembers(group.id);
        return {
          ...group,
          memberCount: members.length,
        };
      })
    );
    
    return groupsWithCounts;
  } catch (error) {
    console.error("getAllGroups error:", error);
    return [];
  }
}

/**
 * Get groups for a specific user
 */
export async function getUserGroups(userId: string) {
  try {
    await requireAuth();
    return await userGroupRepository.getUserGroups(userId);
  } catch (error) {
    console.error("getUserGroups error:", error);
    return [];
  }
}
