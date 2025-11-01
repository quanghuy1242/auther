/**
 * User-to-client access control utilities
 */

export type AccessLevel = "use" | "admin";
export type AccessPolicy = "all_users" | "restricted";

/**
 * Check if access level allows action
 * Admin level grants all permissions
 * 
 * @param accessLevel - User's access level
 * @param requiredLevel - Required access level
 * @returns True if user can perform action
 * 
 * @example
 * canPerformAction("admin", "use"); // true
 * canPerformAction("use", "use"); // true
 * canPerformAction("use", "admin"); // false
 */
export function canPerformAction(
  accessLevel: AccessLevel,
  requiredLevel: AccessLevel
): boolean {
  if (accessLevel === "admin") return true;
  return accessLevel === requiredLevel;
}

/**
 * Parse access level from string
 * 
 * @param level - String to parse
 * @returns Parsed access level or null if invalid
 * 
 * @example
 * parseAccessLevel("use"); // "use"
 * parseAccessLevel("admin"); // "admin"
 * parseAccessLevel("invalid"); // null
 */
export function parseAccessLevel(level: string): AccessLevel | null {
  if (level === "use" || level === "admin") return level;
  return null;
}

/**
 * Parse access policy from string
 * 
 * @param policy - String to parse
 * @returns Parsed access policy or null if invalid
 * 
 * @example
 * parseAccessPolicy("all_users"); // "all_users"
 * parseAccessPolicy("restricted"); // "restricted"
 * parseAccessPolicy("invalid"); // null
 */
export function parseAccessPolicy(policy: string): AccessPolicy | null {
  if (policy === "all_users" || policy === "restricted") return policy;
  return null;
}

/**
 * Get all available access levels
 * 
 * @returns Array of access levels
 * 
 * @example
 * getAllAccessLevels(); // ["use", "admin"]
 */
export function getAllAccessLevels(): AccessLevel[] {
  return ["use", "admin"];
}

/**
 * Get all available access policies
 * 
 * @returns Array of access policies
 * 
 * @example
 * getAllAccessPolicies(); // ["all_users", "restricted"]
 */
export function getAllAccessPolicies(): AccessPolicy[] {
  return ["all_users", "restricted"];
}

/**
 * Validate if access level is valid
 * 
 * @param level - Access level to validate
 * @returns True if valid
 * 
 * @example
 * isValidAccessLevel("use"); // true
 * isValidAccessLevel("invalid"); // false
 */
export function isValidAccessLevel(level: unknown): level is AccessLevel {
  return level === "use" || level === "admin";
}

/**
 * Validate if access policy is valid
 * 
 * @param policy - Access policy to validate
 * @returns True if valid
 * 
 * @example
 * isValidAccessPolicy("all_users"); // true
 * isValidAccessPolicy("invalid"); // false
 */
export function isValidAccessPolicy(policy: unknown): policy is AccessPolicy {
  return policy === "all_users" || policy === "restricted";
}
