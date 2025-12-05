"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { user } from "@/db/auth-schema";
import { inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  tupleRepository,
  authorizationModelRepository,
  oauthClientMetadataRepository,
  userGroupRepository,
} from "@/lib/repositories";
import { updateClientPolicySchema } from "@/schemas/clients";
import { createGroupSchema } from "@/schemas/groups";

export interface AssignUserResult {
  success: boolean;
  error?: string;
  warnings?: string[];
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

/**
 * Get all API keys for a client
 */
export async function getClientApiKeys(clientId: string) {
  try {
    await requireAuth();
    const _headers = await headers();

    const allKeys = await auth.api.listApiKeys({
      headers: _headers,
    });

    if (!allKeys || !Array.isArray(allKeys)) {
      return [];
    }

    return allKeys.filter(
      (key) => key.metadata?.oauth_client_id === clientId
    );
  } catch (error) {
    console.error("getClientApiKeys error:", error);
    return [];
  }
}

// ============================================================================
// User Group Management
// ============================================================================



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

// ============================================================================
// ReBAC Platform Access Management (Layer A)
// ============================================================================

import {
  type Tuple
} from "@/lib/repositories";

/**
 * Platform access relations for OAuth clients
 */
export type PlatformRelation = "owner" | "admin" | "use";

interface PlatformAccessEntry {
  id: string;
  subjectType: "user" | "group";
  subjectId: string;
  relation: PlatformRelation;
  createdAt: Date;
  subjectName?: string;
  subjectEmail?: string;
}

/**
 * Get platform access list for a client
 * Returns all users/groups with platform access (owner, admin, use)
 */
export async function getPlatformAccessList(clientId: string): Promise<PlatformAccessEntry[]> {
  try {
    await requireAuth();

    const tuples = await tupleRepository.findByEntity("oauth_client", clientId);
    const validTuples = tuples.filter((t) =>
      ["owner", "admin", "use"].includes(t.relation)
    );

    // Fetch user details
    const userIds = validTuples
      .filter((t) => t.subjectType === "user")
      .map((t) => t.subjectId);

    const usersMap = new Map<string, { name: string; email: string }>();

    if (userIds.length > 0) {
      const users = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .from(user)
        .where(inArray(user.id, userIds));

      users.forEach((u) => usersMap.set(u.id, u));
    }

    return validTuples.map((t) => ({
      id: t.id,
      subjectType: t.subjectType as "user" | "group",
      subjectId: t.subjectId,
      relation: t.relation as PlatformRelation,
      createdAt: t.createdAt,
      subjectName:
        t.subjectType === "user"
          ? usersMap.get(t.subjectId)?.name
          : undefined,
      subjectEmail:
        t.subjectType === "user"
          ? usersMap.get(t.subjectId)?.email
          : undefined,
    }));
  } catch (error) {
    console.error("getPlatformAccessList error:", error);
    return [];
  }
}

/**
 * Get current user's access level for a client
 * Returns the highest privilege level: owner > admin > use
 * Used for C1/C2 constraint checks in UI
 */
export async function getCurrentUserAccessLevel(
  clientId: string
): Promise<{
  level: PlatformRelation | null;
  canEditModel: boolean;  // C1: owner or admin
  canManageAccess: boolean;  // C2: owner or admin
}> {
  try {
    const session = await requireAuth();
    const userId = session.user.id;

    const { PermissionService } = await import("@/lib/auth/permission-service");
    const permissionService = new PermissionService();
    const level = (await permissionService.getPlatformAccessLevel(userId, clientId)) as PlatformRelation | null;

    return {
      level,
      canEditModel: level === "owner" || level === "admin",
      canManageAccess: level === "owner" || level === "admin",
    };
  } catch (error) {
    console.error("getCurrentUserAccessLevel error:", error);
    return { level: null, canEditModel: false, canManageAccess: false };
  }
}

/**
 * Grant platform access to a user or group
 * Constraint C2: Caller must be admin/owner to grant access
 */
export async function grantPlatformAccess(
  clientId: string,
  subjectType: "user" | "group",
  subjectId: string,
  relation: PlatformRelation
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    // C2: Verify caller is admin/owner of this client
    const { canManageAccess } = await getCurrentUserAccessLevel(clientId);
    if (!canManageAccess) {
      return {
        success: false,
        error: "Permission denied: You must be an admin or owner to grant access",
      };
    }

    const { created } = await tupleRepository.createIfNotExists({
      entityType: "oauth_client",
      entityId: clientId,
      relation,
      subjectType,
      subjectId,
    });

    if (!created) {
      return {
        success: true,
        error: "Access already exists"
      };
    }

    return { success: true };
  } catch (error) {
    console.error("grantPlatformAccess error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to grant access",
    };
  }
}

/**
 * Check if a subject has scoped permissions for a client
 * Used for C6 cascade warning
 */
async function getScopedPermissionCount(
  clientId: string,
  subjectType: "user" | "group",
  subjectId: string
): Promise<number> {
  // Search for all entity types belonging to this client
  // Pattern: client_{clientId}*
  // This matches both "client_{clientId}" (legacy) and "client_{clientId}:{typeName}"
  const scopedEntityTypePrefix = `client_${clientId}`;

  // Note: tupleRepository.findByEntityType performs an exact match.
  // We need a new method or logic to find by prefix, or we iterate all models.
  // For now, let's assume we can fetch all tuples for the subject and filter by entity type prefix.
  const tuples = await tupleRepository.findBySubject(subjectType, subjectId);

  return tuples.filter(t => t.entityType.startsWith(scopedEntityTypePrefix)).length;
}

/**
 * Revoke platform access from a user or group
 * Constraint C6: If cascade=true, also revokes scoped permissions
 */
export async function revokePlatformAccess(
  clientId: string,
  subjectType: "user" | "group",
  subjectId: string,
  relation: PlatformRelation,
  cascade: boolean = false
): Promise<AssignUserResult & { scopedPermissionsRevoked?: number }> {
  try {
    await requireAuth();

    // Check for scoped permissions before revoking
    const scopedCount = await getScopedPermissionCount(clientId, subjectType, subjectId);

    if (scopedCount > 0 && !cascade) {
      return {
        success: false,
        error: `This ${subjectType} has ${scopedCount} scoped permissions. Set cascade=true to revoke them.`,
      };
    }

    // Revoke platform access
    const deleted = await tupleRepository.delete({
      entityType: "oauth_client",
      entityId: clientId,
      relation,
      subjectType,
      subjectId,
    });

    if (!deleted) {
      return {
        success: false,
        error: "Access record not found",
      };
    }

    // C6: Cascade - revoke scoped permissions if requested
    let scopedPermissionsRevoked = 0;
    if (cascade && scopedCount > 0) {
      const scopedEntityType = `client_${clientId}`;
      scopedPermissionsRevoked = await tupleRepository.deleteBySubjectAndEntityType(
        subjectType,
        subjectId,
        scopedEntityType
      );
    }

    return { success: true, scopedPermissionsRevoked };
  } catch (error) {
    console.error("revokePlatformAccess error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke access",
    };
  }
}

// ============================================================================
// ReBAC Authorization Model Management
// ============================================================================

import type { AuthorizationModelDefinition } from "@/schemas/rebac";

/**
 * Model structure for UI: wraps all entity types for a client
 */
export interface ClientAuthorizationModels {
  types: Record<string, {
    relations: Record<string, string>;
    permissions: Record<string, { relation: string }>;
  }>;
}

/**
 * Get all authorization models (entity types) for a client.
 * Returns wrapped format for DataModelEditor compatibility.
 */
export async function getAuthorizationModels(
  clientId: string
): Promise<{ models: ClientAuthorizationModels; error?: string }> {
  try {
    await requireAuth();

    const entityTypes = await authorizationModelRepository.findAllForClient(clientId);

    // Wrap into UI-compatible format
    const types: ClientAuthorizationModels["types"] = {};

    for (const [entityTypeName, def] of Object.entries(entityTypes)) {
      types[entityTypeName] = {
        relations: Object.fromEntries(
          Object.entries(def.relations).map(([rel, subjects]) => [
            rel,
            Array.isArray(subjects) ? subjects.join(" | ") : String(subjects)
          ])
        ),
        permissions: Object.fromEntries(
          Object.entries(def.permissions || {}).map(([perm, permDef]) => [
            perm,
            { relation: permDef.relation }
          ])
        ),
      };
    }

    return { models: { types } };
  } catch (error) {
    console.error("getAuthorizationModels error:", error);
    return {
      models: { types: {} },
      error: error instanceof Error ? error.message : "Failed to get models"
    };
  }
}

/**
 * Update a single entity type's model for a client.
 * Constraint C1: Caller must be admin/owner
 * Constraint C3: Cannot remove relations with active tuples
 */
export async function updateEntityTypeModel(
  clientId: string,
  entityTypeName: string,
  relations: Record<string, string>,
  permissions: Record<string, { relation: string }>
): Promise<AssignUserResult & { warnings?: string[] }> {
  try {
    await requireAuth();

    // C1: Verify caller is admin/owner
    const { canEditModel } = await getCurrentUserAccessLevel(clientId);
    if (!canEditModel) {
      return {
        success: false,
        error: "Permission denied: You must be an admin or owner to update the authorization model",
      };
    }

    // Convert UI format to DB format
    const definition: AuthorizationModelDefinition = {
      relations: Object.fromEntries(
        Object.entries(relations).map(([rel, subjects]) => [
          rel,
          subjects.split("|").map(s => s.trim()).filter(Boolean)
        ])
      ),
      permissions: Object.fromEntries(
        Object.entries(permissions).map(([perm, def]) => [
          perm,
          { relation: def.relation }
        ])
      ),
    };

    const fullEntityType = `client_${clientId}:${entityTypeName}`;

    // Pre-validate (C3 check)
    const validation = await authorizationModelRepository.preValidateUpdate(
      fullEntityType,
      definition
    );

    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join("; "),
      };
    }

    // Upsert
    await authorizationModelRepository.upsertEntityTypeForClient(
      clientId,
      entityTypeName,
      definition
    );

    return {
      success: true,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } catch (error) {
    console.error("updateEntityTypeModel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update model",
    };
  }
}

/**
 * Delete an entity type's model for a client.
 */
export async function deleteEntityTypeModel(
  clientId: string,
  entityTypeName: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    const result = await authorizationModelRepository.deleteEntityTypeForClient(
      clientId,
      entityTypeName
    );

    if (!result.deleted) {
      return { success: false, error: result.error };
    }

    return { success: true };
  } catch (error) {
    console.error("deleteEntityTypeModel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete model",
    };
  }
}

// Keep legacy getAuthorizationModel for backward compatibility
export async function getAuthorizationModel(
  clientId: string
): Promise<{ model: AuthorizationModelDefinition | null; error?: string }> {
  try {
    await requireAuth();
    const model = await authorizationModelRepository.findByClientId(clientId);
    return { model };
  } catch (error) {
    console.error("getAuthorizationModel error:", error);
    return {
      model: null,
      error: error instanceof Error ? error.message : "Failed to get model"
    };
  }
}

// Keep legacy updateAuthorizationModel for backward compatibility
export async function updateAuthorizationModel(
  clientId: string,
  definition: AuthorizationModelDefinition
): Promise<AssignUserResult & { warnings?: string[] }> {
  try {
    await requireAuth();
    const entityType = `client_${clientId}`;
    const validation = await authorizationModelRepository.preValidateUpdate(
      entityType,
      definition
    );
    if (!validation.valid) {
      return { success: false, error: validation.errors.join("; ") };
    }
    await authorizationModelRepository.upsertForClient(clientId, definition);
    return {
      success: true,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    };
  } catch (error) {
    console.error("updateAuthorizationModel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update model",
    };
  }
}

// ============================================================================
// ReBAC Scoped Permissions Management (Layer B)
// ============================================================================

interface ScopedPermissionEntry {
  id: string;
  entityId: string; // e.g., "invoices:*" or "invoices:123"
  relation: string;
  subjectType: "user" | "group" | "apikey";
  subjectId: string;
  createdAt: Date;
}

/**
 * Get scoped permissions for a client
 * These are permissions within the client's application (Layer B)
 */
export async function getScopedPermissions(clientId: string): Promise<ScopedPermissionEntry[]> {
  try {
    await requireAuth();

    const scopedEntityType = `client_${clientId}`;
    const tuples = await tupleRepository.findByEntityType(scopedEntityType);

    return tuples.map(t => ({
      id: t.id,
      entityId: t.entityId,
      relation: t.relation,
      subjectType: t.subjectType as "user" | "group" | "apikey",
      subjectId: t.subjectId,
      createdAt: t.createdAt,
    }));
  } catch (error) {
    console.error("getScopedPermissions error:", error);
    return [];
  }
}

/**
 * Grant a scoped permission
 * Constraint C2: Caller must be admin
 * Constraint C3: Relation must exist in authorization model
 */
export async function grantScopedPermission(
  clientId: string,
  entityTypeName: string, // e.g. "invoice", "report"
  entityId: string, // e.g., "*" for wildcard or specific ID
  relation: string,
  subjectType: "user" | "group" | "apikey",
  subjectId: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    // C2: Verify caller is admin
    const { canManageAccess } = await getCurrentUserAccessLevel(clientId);
    if (!canManageAccess) {
      return {
        success: false,
        error: "Permission denied: You must be an admin or owner to grant permissions",
      };
    }

    // C3: Verify relation exists in authorization model
    // We need to check the specific entity type's model
    const fullEntityType = `client_${clientId}:${entityTypeName}`;
    const model = await authorizationModelRepository.findByEntityType(fullEntityType);

    if (model) {
      const validRelations = Object.keys(model.definition.relations);
      if (!validRelations.includes(relation)) {
        return {
          success: false,
          error: `Relation '${relation}' is not defined in the authorization model for '${entityTypeName}'. Valid relations: ${validRelations.join(", ")}`,
        };
      }
    } else {
      return {
        success: false,
        error: `Entity type '${entityTypeName}' not found in authorization model.`,
      };
    }

    const { created } = await tupleRepository.createIfNotExists({
      entityType: fullEntityType,
      entityId,
      relation,
      subjectType,
      subjectId,
    });

    if (!created) {
      return {
        success: true,
        error: "Permission already exists",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("grantScopedPermission error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to grant permission",
    };
  }
}

/**
 * Revoke a scoped permission
 * Constraint C5: Warn if API keys depend on this permission
 */
export async function revokeScopedPermission(
  tupleId: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    // Verify ownership of the tuple before revoking
    const tuple = await tupleRepository.findById(tupleId);
    if (!tuple) {
      return {
        success: false,
        error: "Permission not found",
      };
    }

    // Extract clientId from entityType (format: client_{clientId} or client_{clientId}:{typeName})
    const match = tuple.entityType.match(/^client_([^:]+)/);
    if (!match) {
      return {
        success: false,
        error: "Invalid entity type format",
      };
    }
    const clientId = match[1];

    // C2: Verify caller is admin
    const { canManageAccess } = await getCurrentUserAccessLevel(clientId);
    if (!canManageAccess) {
      return {
        success: false,
        error: "Permission denied: You must be an admin or owner to revoke permissions",
      };
    }

    // C5: Check for API key dependencies
    const warnings: string[] = [];

    if (tuple.subjectType === "apikey") {
      warnings.push(`This permission was directly assigned to an API Key (ID: ${tuple.subjectId}). The key will lose this access.`);
    } else if (tuple.subjectType === "group") {
      // Check if any API keys are members of this group
      const groupMembers = await tupleRepository.findByEntityAndRelation(
        "group",
        tuple.subjectId,
        "member"
      );

      const apiKeyMembers = groupMembers.filter(m => m.subjectType === "apikey");
      if (apiKeyMembers.length > 0) {
        warnings.push(`This group contains ${apiKeyMembers.length} API Key(s) that will lose this access.`);
      }
    }

    const deleted = await tupleRepository.deleteById(tupleId);

    if (!deleted) {
      return {
        success: false,
        error: "Permission not found",
      };
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (error) {
    console.error("revokeScopedPermission error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke permission",
    };
  }
}

/**
 * Get all tuples for a specific subject (for debugging/admin view)
 */
export async function getSubjectPermissions(
  subjectType: "user" | "group" | "apikey",
  subjectId: string
): Promise<Tuple[]> {
  try {
    await requireAuth();
    return await tupleRepository.findBySubject(subjectType, subjectId);
  } catch (error) {
    console.error("getSubjectPermissions error:", error);
    return [];
  }
}

// ============================================================================
// Constraint Check Actions (for UI validation)
// ============================================================================

/**
 * C3: Check if a relation is currently in use by any tuples
 * Used before removing a relation from the data model
 */
export async function checkRelationUsage(
  clientId: string,
  entityTypeName: string,
  relation: string
): Promise<{ inUse: boolean; count: number }> {
  try {
    await requireAuth();

    const fullEntityType = `client_${clientId}:${entityTypeName}`;
    const count = await tupleRepository.countByRelation(fullEntityType, relation);

    return { inUse: count > 0, count };
  } catch (error) {
    console.error("checkRelationUsage error:", error);
    return { inUse: false, count: 0 };
  }
}

/**
 * C5: Check if any API keys depend on a specific scoped permission
 * Used before revoking a permission to warn about API key impact
 */
export async function checkApiKeyDependencies(
  clientId: string,
  entityId: string,
  relation: string
): Promise<{ hasApiKeyDependencies: boolean; apiKeyCount: number }> {
  try {
    await requireAuth();

    const scopedEntityType = `client_${clientId}`;
    const tuples = await tupleRepository.findByEntityType(scopedEntityType);

    // Find API key subjects with this specific permission
    const apiKeyTuples = tuples.filter(t =>
      t.subjectType === "apikey" &&
      t.entityId === entityId &&
      t.relation === relation
    );

    return {
      hasApiKeyDependencies: apiKeyTuples.length > 0,
      apiKeyCount: apiKeyTuples.length,
    };
  } catch (error) {
    console.error("checkApiKeyDependencies error:", error);
    return { hasApiKeyDependencies: false, apiKeyCount: 0 };
  }
}

/**
 * C6: Check scoped permissions for a user before revoking platform access
 * Returns count of scoped permissions that would be cascade-deleted
 */
export async function checkScopedPermissionsForUser(
  clientId: string,
  subjectType: "user" | "group",
  subjectId: string
): Promise<{ count: number; permissions: Array<{ entityId: string; relation: string }> }> {
  try {
    await requireAuth();

    const scopedEntityType = `client_${clientId}`;
    const tuples = await tupleRepository.findByEntityType(scopedEntityType);

    const userPermissions = tuples.filter(t =>
      t.subjectType === subjectType && t.subjectId === subjectId
    );

    return {
      count: userPermissions.length,
      permissions: userPermissions.map(t => ({
        entityId: t.entityId,
        relation: t.relation,
      })),
    };
  } catch (error) {
    console.error("checkScopedPermissionsForUser error:", error);
    return { count: 0, permissions: [] };
  }
}
