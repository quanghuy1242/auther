/**
 * Permission and resource access utilities
 */

export type ResourcePermissions = Record<string, string[]>;

export interface PermissionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate that requested permissions are allowed
 * 
 * @param permissions - Requested permissions to validate
 * @param allowedResources - Allowed resources and their actions
 * @returns Validation result with errors if any
 * 
 * @example
 * const result = validatePermissions(
 *   { "projects": ["read", "write"] },
 *   { "projects": ["read", "write", "delete"], "users": ["read"] }
 * );
 * // { valid: true, errors: [] }
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
 * 
 * @example
 * mergePermissions(
 *   { "projects": ["read"] },
 *   { "projects": ["write"], "users": ["read"] }
 * );
 * // { "projects": ["read", "write"], "users": ["read"] }
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
 * 
 * @example
 * hasPermission(
 *   { "projects": ["read", "write"] },
 *   "projects",
 *   "read"
 * ); // true
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
 * 
 * @example
 * parsePermissions('{"projects":["read"]}');
 * // { "projects": ["read"] }
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
 * 
 * @example
 * stringifyPermissions({ "projects": ["read"] });
 * // '{"projects":["read"]}'
 */
export function stringifyPermissions(permissions: ResourcePermissions): string {
  return JSON.stringify(permissions);
}

/**
 * Check if permissions object is empty
 * 
 * @param permissions - Permissions to check
 * @returns True if empty
 * 
 * @example
 * isEmptyPermissions({}); // true
 * isEmptyPermissions({ "projects": [] }); // true (no actions)
 * isEmptyPermissions({ "projects": ["read"] }); // false
 */
export function isEmptyPermissions(permissions: ResourcePermissions): boolean {
  return Object.keys(permissions).length === 0 || 
         Object.values(permissions).every(actions => actions.length === 0);
}
