/**
 * Permission and resource access utilities
 */

export type ResourcePermissions = Record<string, string[]>;

export interface PermissionValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PermissionRow {
  resource: string;
  actions: string;
}

export const RESOURCE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
export const ACTION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validate that requested permissions are allowed
 * 
 * @param permissions - Requested permissions to validate
 * @param allowedResources - Allowed resources and their actions
 * @returns Validation result with errors if any
 */
export function validatePermissions(
  permissions: ResourcePermissions,
  allowedResources: ResourcePermissions
): PermissionValidationResult {
  const errors: string[] = [];
  
  for (const [resource, actions] of Object.entries(permissions)) {
    if (!allowedResources[resource]) {
      errors.push(`Resource "${resource}" is not allowed`);
      continue;
    }
    
    for (const action of actions) {
      if (!allowedResources[resource].includes(action)) {
        errors.push(`Action "${action}" not allowed for resource "${resource}"`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Merge default permissions with custom permissions
 * Combines permissions, removing duplicates
 * 
 * @param defaults - Default permissions
 * @param custom - Custom permissions to merge
 * @returns Merged permissions
 */
export function mergePermissions(
  defaults: ResourcePermissions,
  custom: ResourcePermissions
): ResourcePermissions {
  const merged = { ...defaults };
  
  for (const [resource, actions] of Object.entries(custom)) {
    merged[resource] = [...new Set([...(merged[resource] || []), ...actions])];
  }
  
  return merged;
}

/**
 * Check if user has required permission
 * 
 * @param userPermissions - User's permissions
 * @param requiredResource - Required resource
 * @param requiredAction - Required action
 * @returns True if user has the permission
 */
export function hasPermission(
  userPermissions: ResourcePermissions,
  requiredResource: string,
  requiredAction: string
): boolean {
  const actions = userPermissions[requiredResource];
  return actions?.includes(requiredAction) ?? false;
}

/**
 * Parse JSON permissions safely
 * 
 * @param json - JSON string to parse
 * @returns Parsed permissions or empty object
 */
export function parsePermissions(json: string | null): ResourcePermissions {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ResourcePermissions;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Stringify permissions to JSON
 * 
 * @param permissions - Permissions to stringify
 * @returns JSON string
 */
export function stringifyPermissions(permissions: ResourcePermissions): string {
  return JSON.stringify(permissions);
}

/**
 * Check if permissions object is empty
 * 
 * @param permissions - Permissions to check
 * @returns True if empty
 */
export function isEmptyPermissions(permissions: ResourcePermissions): boolean {
  return Object.keys(permissions).length === 0 || 
         Object.values(permissions).every(actions => actions.length === 0);
}

/**
 * Convert ResourcePermissions object to array of permission tags ["resource:action"]
 */
export function permissionsToTags(permissions: ResourcePermissions): string[] {
  const tags: string[] = [];
  for (const [resource, actions] of Object.entries(permissions)) {
    for (const action of actions) {
      tags.push(`${resource}:${action}`);
    }
  }
  return tags;
}

/**
 * Convert array of permission tags ["resource:action"] to ResourcePermissions object
 */
export function tagsToPermissions(tags: string[]): ResourcePermissions {
  const permissions: ResourcePermissions = {};
  
  for (const tag of tags) {
    const [resource, action] = tag.split(":");
    if (resource && action) {
      if (!permissions[resource]) {
        permissions[resource] = [];
      }
      if (!permissions[resource].includes(action)) {
        permissions[resource].push(action);
      }
    }
  }
  
  return permissions;
}

/**
 * Convert ResourcePermissions object to array of PermissionRow for UI display
 */
export function permissionsToRows(permissions: ResourcePermissions): PermissionRow[] {
  return Object.entries(permissions).map(([resource, actions]) => ({
    resource,
    actions: actions.join(", "),
  }));
}

/**
 * Convert array of PermissionRow to ResourcePermissions object
 * Includes validation for resource and action names
 */
export function rowsToPermissions(rows: PermissionRow[]): {
  permissions: ResourcePermissions;
  error?: string;
} {
  const permissions: ResourcePermissions = {};
  
  for (const row of rows) {
    const resource = row.resource.trim();
    const actions = row.actions
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
    
    if (!resource || actions.length === 0) {
      continue;
    }
    
    if (!RESOURCE_NAME_REGEX.test(resource)) {
      return { 
        permissions: {}, 
        error: `Resource "${resource}" contains invalid characters. Use only letters, numbers, hyphens, and underscores.` 
      };
    }
    
    for (const action of actions) {
      if (!ACTION_NAME_REGEX.test(action)) {
        return { 
          permissions: {}, 
          error: `Action "${action}" in resource "${resource}" contains invalid characters.` 
        };
      }
    }
    
    permissions[resource] = actions;
  }
  
  return { permissions };
}