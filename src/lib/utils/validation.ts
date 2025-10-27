/**
 * Validation utility functions
 */

/**
 * Validates timestamp to ensure it's not too old
 * @param timestamp Unix timestamp in milliseconds
 * @param maxAgeMs Maximum age in milliseconds (default: 5 minutes)
 */
export function validateTimestamp(
  timestamp: number,
  maxAgeMs: number = 5 * 60_000
): boolean {
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  
  const age = Date.now() - timestamp;
  return age <= maxAgeMs;
}

/**
 * Validates required string field
 */
export function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates that all required fields are strings
 */
export function validateRequiredFields(
  fields: Record<string, unknown>,
  requiredKeys: string[]
): boolean {
  return requiredKeys.every((key) => isValidString(fields[key]));
}
