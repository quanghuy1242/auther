import { z } from "zod";

/**
 * Schema for a single permission definition.
 * Defines what relation is required and optional ABAC policies.
 */
export const permissionSchema = z.object({
  relation: z.string().describe("The relation required to have this permission (e.g., 'viewer')"),
  description: z.string().optional().describe("Human-readable description of the permission"),
  
  // ABAC Policy configuration
  policyEngine: z.enum(["lua"]).optional().describe("The policy engine to use for attribute-based checks"),
  policy: z.string().optional().describe("The source code of the policy script"),
});

/**
 * Strict Schema for the Authorization Model Definition stored in the DB.
 * 
 * Structure:
 * - relations: Defines the role hierarchy (transitivity).
 *   Key: The relation name (e.g., 'viewer').
 *   Value: Array of other relations that imply this one (e.g., ['editor', 'owner']).
 * 
 * - permissions: Defines the high-level actions.
 *   Key: The permission name (e.g., 'read', 'create').
 *   Value: The Permission definition linking it to a relation.
 */
export const authorizationModelSchema = z.object({
  relations: z.record(
    z.string(), 
    z.array(z.string())
  ).describe("Map of relations to the list of relations that imply them (inheritance)"),
  
  permissions: z.record(
    z.string(), 
    permissionSchema
  ).describe("Map of permission names to their definitions"),
});

export type PermissionDefinition = z.infer<typeof permissionSchema>;
export type AuthorizationModelDefinition = z.infer<typeof authorizationModelSchema>;
