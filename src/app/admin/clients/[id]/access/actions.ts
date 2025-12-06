"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { user } from "@/db/auth-schema";
import { userGroup } from "@/db/app-schema";
import { accessTuples, authorizationModels } from "@/db/rebac-schema";
import { inArray, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  tupleRepository,
  authorizationModelRepository,
  oauthClientMetadataRepository,
  userGroupRepository,
} from "@/lib/repositories";
import { updateClientPolicySchema } from "@/schemas/clients";
import { createGroupSchema } from "@/schemas/groups";
import { validateLuaSyntax, analyzeLuaPolicy, testLuaPolicy } from "@/lib/auth/lua-validator";

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
/*
 * Get all API keys for a client, enriched with ReBAC permissions
 */
export async function getClientApiKeys(clientId: string) {
  try {
    await requireAuth();
    const _headers = await headers();

    // Check access C1/C2 (must be admin/owner to view keys?)
    // Actually, traditionally view access might be enough, but keys are sensitive.
    // Let's stick to standard requireAuth for now and filter by client metadata.

    // 1. List keys from Better Auth
    const allKeys = await auth.api.listApiKeys({
      headers: _headers,
    });

    if (!allKeys || !Array.isArray(allKeys)) {
      return [];
    }

    // 2. Filter for this client
    const clientKeys = allKeys.filter(
      (key) => key.metadata?.oauth_client_id === clientId
    );

    // 3. Enrich with permissions from Tuples (Subject: apikey:{id})
    const enrichedKeys = await Promise.all(
      clientKeys.map(async (key) => {
        // Find tuples where subject is this API key
        // We look for Tuples (Entity, Relation, Subject) -> (client_clientId:resource, action, apikey:keyId)
        const tuples = await tupleRepository.findBySubject("apikey", key.id);

        // Map tuples back to "permissions" object format: { "resource": ["action1", "action2"] }
        // Tuple Entity format: "client_{clientId}:{resource}"
        // We need to parse the resource name from the entity type.
        const permissions: Record<string, string[]> = {};
        const prefix = `client_${clientId}:`;

        for (const tuple of tuples) {
          if (tuple.entityType.startsWith(prefix)) {
            const resource = tuple.entityType.substring(prefix.length);
            // If resource is empty (e.g. wildcards), handle appropriately, but usually it's "invoice"
            if (resource) {
              if (!permissions[resource]) {
                permissions[resource] = [];
              }
              permissions[resource].push(tuple.relation);
            }
          }
        }

        return {
          ...key,
          permissions: permissions, // Override permissions with ReBAC source of truth
        };
      })
    );

    return enrichedKeys;
  } catch (error) {
    console.error("getClientApiKeys error:", error);
    return [];
  }
}

/**
 * Create a new API key for a client with ReBAC permissions
 */
const createApiKeySchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  permissions: z.record(z.string(), z.array(z.string())),
  expiresInDays: z.number().min(1).max(3650).optional(),
});

export interface ApiKeyResult {
  success: boolean;
  error?: string;
  apiKey?: {
    id: string;
    key: string;
    name: string;
    expiresAt: Date | null;
  };
}

export async function createClientApiKey(
  data: z.infer<typeof createApiKeySchema>
): Promise<ApiKeyResult> {
  try {
    const session = await requireAuth();
    const validated = createApiKeySchema.parse(data);

    // 1. Verify caller is admin/owner (C2)
    const { level, canManageAccess } = await getCurrentUserAccessLevel(validated.clientId);
    if (!canManageAccess) {
      return {
        success: false,
        error: "Permission denied: You must be an admin or owner to create API keys",
      };
    }

    // 2. Create API key using Better Auth
    // IMPORTANT: Pass empty permissions to Better Auth so it doesn't do its own internal checks.
    // We rely on Tuples for permission storage.
    const expiresIn = validated.expiresInDays
      ? validated.expiresInDays * 24 * 60 * 60
      : null;

    const result = await auth.api.createApiKey({
      body: {
        name: validated.name,
        permissions: {}, // Intentionally empty - using Tuples instead
        expiresIn,
        userId: session.user.id,
        metadata: {
          oauth_client_id: validated.clientId,
          access_level: level,
        },
      },
    });

    if (!result) {
      return {
        success: false,
        error: "Failed to create API key",
      };
    }

    // 3. Create Tuples for requested permissions
    // permissions format: { "invoice": ["read", "write"] }
    // Tuple: (Entity="client_{id}:invoice", Relation="read", Subject="apikey:{keyId}")
    const promises: Promise<unknown>[] = [];

    for (const [resource, actions] of Object.entries(validated.permissions)) {
      const entityType = `client_${validated.clientId}:${resource}`;

      for (const action of actions) {
        promises.push(
          tupleRepository.create({
            entityType,
            entityId: "*", // Or specific ID if we supported specific resource grants here (usually wildcard for keys)
            relation: action,
            subjectType: "apikey",
            subjectId: result.id,
          })
        );
      }
    }

    await Promise.all(promises);

    return {
      success: true,
      apiKey: {
        id: result.id,
        key: result.key,
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
 * Revoke an API key and clean up permissions
 */
export async function revokeClientApiKey(keyId: string): Promise<AssignUserResult> {
  try {
    await requireAuth();

    // 1. Revoke in Better Auth (sets status to disabled/revoked?)
    // Better Auth's revokeApiKey usually deletes or disables.
    const _headers = await headers();

    // 1. Revoke in Better Auth (sets status to disabled/revoked?)
    // Better Auth's revokeApiKey usually deletes or disables.
    const result = await auth.api.deleteApiKey({
      body: {
        keyId: keyId
      },
      headers: _headers,
    });

    if (!result.success) {
      return {
        success: false,
        error: "Failed to revoke API key in auth provider"
      };
    }

    // 2. Cleanup Tuples
    await tupleRepository.deleteBySubject("apikey", keyId);

    return { success: true };
  } catch (error) {
    console.error("revokeClientApiKey error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to revoke API key",
    };
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

    // Ensure a single platform relation per subject: remove other relations before creating
    const platformRelations: PlatformRelation[] = ["owner", "admin", "use"];
    for (const rel of platformRelations) {
      if (rel === relation) continue;
      await tupleRepository.delete({
        entityType: "oauth_client",
        entityId: clientId,
        relation: rel,
        subjectType,
        subjectId,
      });
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
    permissions: Record<string, { relation: string; policyEngine?: "lua"; policy?: string }>;
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
          Object.entries(def.permissions || {}).map(([perm, permDef]) => {
            const result: { relation: string; policyEngine?: "lua"; policy?: string } = {
              relation: permDef.relation
            };
            if (permDef.policyEngine) result.policyEngine = permDef.policyEngine;
            if (permDef.policy) result.policy = permDef.policy;
            return [perm, result];
          })
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
  relations: Record<string, unknown>,
  permissions: Record<string, { relation: string; policyEngine?: "lua"; policy?: string }>
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

    // Convert UI format (strings, arrays, or { union, subjectParams }) to DB format
    const normalizeRelationSubjects = (
      value: unknown
    ): AuthorizationModelDefinition["relations"][string] => {
      if (typeof value === "string") {
        return value
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      if (Array.isArray(value)) {
        return value.map((v) => String(v).trim()).filter(Boolean);
      }

      if (value && typeof value === "object") {
        const obj = value as { union?: unknown; subjectParams?: { hierarchy?: unknown } };
        const union = Array.isArray(obj.union)
          ? obj.union.map((v) => String(v).trim()).filter(Boolean)
          : [];

        const subjectParams = obj.subjectParams && typeof obj.subjectParams === "object"
          ? { hierarchy: Boolean(obj.subjectParams.hierarchy) }
          : undefined;

        if (subjectParams || union.length > 0) {
          return subjectParams ? { union, subjectParams } : { union };
        }
      }

      // Fallback: empty relation list
      return [];
    };

    // Convert UI format to DB format
    const definition: AuthorizationModelDefinition = {
      relations: Object.fromEntries(
        Object.entries(relations).map(([rel, subjects]) => [
          rel,
          normalizeRelationSubjects(subjects)
        ])
      ),
      permissions: Object.fromEntries(
        Object.entries(permissions).map(([perm, def]) => {
          const permDef: { relation: string; policyEngine?: "lua"; policy?: string } = {
            relation: def.relation
          };
          if (def.policyEngine && def.policy) {
            permDef.policyEngine = def.policyEngine;
            permDef.policy = def.policy;
          }
          return [perm, permDef];
        })
      ),
    };

    const fullEntityType = `client_${clientId}:${entityTypeName}`;

    // Validate all Lua policies before saving
    // This is a server-side safety check - even if UI validation fails or is bypassed
    for (const [permName, permDef] of Object.entries(permissions)) {
      if (permDef.policy && permDef.policyEngine === "lua") {
        const syntaxResult = await validateLuaSyntax(permDef.policy);
        if (!syntaxResult.valid) {
          return {
            success: false,
            error: `Invalid Lua policy for permission "${permName}": ${syntaxResult.error}`,
          };
        }
      }
    }

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

    // Save policy versions for tracking
    const { abacRepository } = await import("@/lib/repositories/abac-repository");
    for (const [permName, permDef] of Object.entries(permissions)) {
      if (permDef.policy && permDef.policyEngine === "lua") {
        abacRepository.savePolicyVersion({
          entityType: fullEntityType,
          permissionName: permName,
          policyLevel: "permission",
          policyScript: permDef.policy,
          changedByType: "user",
        }).catch(err => console.error("Failed to save policy version:", err));
      }
    }

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

/**
 * Rename an entity type for a client.
 * Since tuples now reference entity types by ID (entity_type_id), renaming
 * only requires updating the authorization_models.entity_type column.
 * The tuples automatically follow via the FK relationship.
 */
export async function renameEntityType(
  clientId: string,
  oldName: string,
  newName: string
): Promise<AssignUserResult> {
  try {
    await requireAuth();

    const oldFullType = `client_${clientId}:${oldName}`;
    const newFullType = `client_${clientId}:${newName}`;

    // Check if old entity type exists
    const oldModel = await authorizationModelRepository.findByEntityType(oldFullType);
    if (!oldModel) {
      return {
        success: false,
        error: `Entity type '${oldName}' not found.`,
      };
    }

    // Check if new name already exists
    const existingNew = await authorizationModelRepository.findByEntityType(newFullType);
    if (existingNew) {
      return {
        success: false,
        error: `Entity type '${newName}' already exists.`,
      };
    }

    // Update the authorization model's entity_type
    // Tuples reference by entity_type_id (FK), so they automatically follow!
    const result = await authorizationModelRepository.updateEntityType(oldModel.id, newFullType);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to rename entity type",
      };
    }

    // Also update the entity_type string in tuples for display purposes
    // (This is denormalized but helpful for debugging/queries)
    await tupleRepository.updateEntityTypeString(oldModel.id, newFullType);

    return { success: true };
  } catch (error) {
    console.error("renameEntityType error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to rename entity type",
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
  entityTypeName: string; // e.g., "invoice", "report" (extracted from entity_type)
  entityId: string; // e.g., "*" or "123"
  relation: string;
  subjectType: "user" | "group" | "apikey";
  subjectId: string;
  subjectName?: string;
  subjectEmail?: string;
  condition?: string;
  createdAt: Date;
}

/**
 * Get scoped permissions for a client
 * These are permissions within the client's application (Layer B)
 * Uses JOIN to get real-time entity type names from authorization_models
 */
export async function getScopedPermissions(clientId: string): Promise<ScopedPermissionEntry[]> {
  try {
    await requireAuth();

    // Use prefix match to find all entity types for this client (e.g., client_abc123:invoice, client_abc123:report)
    const scopedEntityTypePrefix = `client_${clientId}:`;

    // Single query: JOIN tuples with authorization_models to get entity type names
    // This avoids N+1 and gets real-time names even after rename
    const tuplesWithModels = await db
      .select({
        id: accessTuples.id,
        entityType: authorizationModels.entityType, // Get fresh name from auth model
        entityId: accessTuples.entityId,
        relation: accessTuples.relation,
        subjectType: accessTuples.subjectType,
        subjectId: accessTuples.subjectId,
        condition: accessTuples.condition,
        createdAt: accessTuples.createdAt,
      })
      .from(accessTuples)
      .innerJoin(
        authorizationModels,
        eq(accessTuples.entityTypeId, authorizationModels.id)
      )
      .where(sql`${authorizationModels.entityType} LIKE ${scopedEntityTypePrefix + '%'}`);

    // Collect user and group IDs for lookup
    const userIds = tuplesWithModels
      .filter((t) => t.subjectType === "user")
      .map((t) => t.subjectId);
    const groupIds = tuplesWithModels
      .filter((t) => t.subjectType === "group")
      .map((t) => t.subjectId);

    // Lookup user details
    const usersMap = new Map<string, { name: string | null; email: string }>();
    if (userIds.length > 0) {
      const users = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
        })
        .from(user)
        .where(inArray(user.id, userIds));

      users.forEach((u) => usersMap.set(u.id, { name: u.name, email: u.email }));
    }

    // Lookup group details
    const groupsMap = new Map<string, { name: string }>();
    if (groupIds.length > 0) {
      const groups = await db
        .select({
          id: userGroup.id,
          name: userGroup.name,
        })
        .from(userGroup)
        .where(inArray(userGroup.id, groupIds));

      groups.forEach((g) => groupsMap.set(g.id, { name: g.name }));
    }

    return tuplesWithModels.map(t => {
      // Extract entity type name from full entity_type (e.g., "client_xxx:entity_1" -> "entity_1")
      const entityTypeParts = t.entityType.split(":");
      const entityTypeName = entityTypeParts.length > 1 ? entityTypeParts[1] : entityTypeParts[0];

      return {
        id: t.id,
        entityTypeName,
        entityId: t.entityId,
        relation: t.relation,
        subjectType: t.subjectType as "user" | "group" | "apikey",
        subjectId: t.subjectId,
        subjectName:
          t.subjectType === "user"
            ? usersMap.get(t.subjectId)?.name ?? undefined
            : t.subjectType === "group"
              ? groupsMap.get(t.subjectId)?.name ?? undefined
              : undefined,
        subjectEmail:
          t.subjectType === "user"
            ? usersMap.get(t.subjectId)?.email
            : undefined,
        condition: t.condition ?? undefined,
        createdAt: t.createdAt,
      };
    });
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
  subjectId: string,
  condition?: string // Optional Lua script for per-grant ABAC
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

    // Validate Lua condition before saving
    // Server-side safety check - prevents invalid scripts from being stored
    if (condition) {
      const syntaxResult = await validateLuaSyntax(condition);
      if (!syntaxResult.valid) {
        return {
          success: false,
          error: `Invalid Lua condition: ${syntaxResult.error}`,
        };
      }
    }

    const { created, tuple } = await tupleRepository.createIfNotExists({
      entityType: fullEntityType,
      entityTypeId: model.id,  // FK to authorization_models for rename support
      entityId,
      relation,
      subjectType,
      subjectId,
      condition: condition || undefined,
    });

    if (!created) {
      return {
        success: true,
        error: "Permission already exists",
      };
    }

    // Save tuple-level policy version for tracking
    if (condition && tuple) {
      const { abacRepository } = await import("@/lib/repositories/abac-repository");
      abacRepository.savePolicyVersion({
        entityType: fullEntityType,
        permissionName: relation,
        policyLevel: "tuple",
        tupleId: tuple.id,
        policyScript: condition,
        changedByType: "user",
      }).catch(err => console.error("Failed to save policy version:", err));
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

// ============================================================================
// ABAC Policy Validation & Testing
// ============================================================================

/**
 * Validate Lua policy syntax without executing.
 */
export async function validatePolicyScript(
  script: string
): Promise<{ valid: boolean; error?: string; warnings?: string[]; suggestions?: string[] }> {
  try {
    const syntaxResult = await validateLuaSyntax(script);
    const analysis = analyzeLuaPolicy(script);

    if (!syntaxResult.valid) {
      return {
        valid: false,
        error: syntaxResult.error,
        warnings: analysis.warnings,
        suggestions: analysis.suggestions,
      };
    }

    return {
      valid: true,
      warnings: analysis.warnings.length > 0 ? analysis.warnings : undefined,
      suggestions: analysis.suggestions.length > 0 ? analysis.suggestions : undefined,
    };
  } catch (error) {
    console.error("validatePolicyScript error:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}

/**
 * Test a Lua policy with sample context.
 */
export async function testPolicyScript(
  script: string,
  context: Record<string, unknown>
): Promise<{ result: boolean; executionTimeMs: number; error?: string }> {
  try {
    await requireAuth();

    return await testLuaPolicy(script, context);
  } catch (error) {
    console.error("testPolicyScript error:", error);
    return {
      result: false,
      executionTimeMs: 0,
      error: error instanceof Error ? error.message : "Test failed",
    };
  }
}
