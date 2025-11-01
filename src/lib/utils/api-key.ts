/**
 * API Key Utilities
 * 
 * Note: Better Auth handles API key generation, hashing, and storage automatically.
 * These utilities are for working with Better Auth's API key plugin and generating
 * IDs for related records.
 * 
 * Better Auth provides:
 * - auth.api.createApiKey() - Generate and store API keys
 * - auth.api.verifyApiKey() - Verify and check permissions
 * - auth.api.listApiKeys() - List user's API keys
 * - auth.api.deleteApiKey() - Revoke API keys
 * 
 * See: https://www.better-auth.com/docs/plugins/api-key
 */

import { randomBytes } from "crypto";

/**
 * Generate a unique ID for database records
 * Used for non-API-key records like user-client-access, groups, etc.
 * 
 * @returns A hex string ID
 * 
 * @example
 * generateApiKeyId(); // "a1b2c3d4e5f6..."
 */
export function generateApiKeyId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Extract the prefix from an API key
 * Example: "ba_abc123" -> "ba"
 * 
 * @param apiKey - The API key
 * @returns The prefix or empty string if invalid format
 * 
 * @example
 * extractApiKeyPrefix("ba_abc123"); // "ba"
 * extractApiKeyPrefix("sk_live_XYZ"); // "sk"
 */
export function extractApiKeyPrefix(apiKey: string): string {
  const match = apiKey.match(/^([a-z]+)_/);
  return match ? match[1] : "";
}

/**
 * Check if a string matches the API key format
 * Format: prefix_alphanumeric
 * 
 * @param value - The string to check
 * @returns True if valid API key format
 * 
 * @example
 * isValidApiKeyFormat("ba_abc123"); // true
 * isValidApiKeyFormat("sk_live_XYZ789"); // true
 * isValidApiKeyFormat("invalid"); // false
 */
export function isValidApiKeyFormat(value: string): boolean {
  return /^[a-z]+_[a-zA-Z0-9]+$/.test(value);
}
