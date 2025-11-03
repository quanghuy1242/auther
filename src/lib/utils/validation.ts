/**
 * Validation utility functions
 */

import { z } from "zod";

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

const TRUE_VALUES = new Set(["true", "1", "on", "yes"]);
const FALSE_VALUES = new Set(["false", "0", "off", "no"]);

/**
 * Boolean field helper that safely coerces form values (strings, numbers) to booleans.
 * Useful for React Hook Form + FormData workflows where checkboxes submit string values.
 */
export const booleanField = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return value;
}, z.boolean());
