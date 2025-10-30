/**
 * Common utilities for script files
 */

import { config as loadEnv } from "dotenv";

/**
 * Loads environment variables from .env files
 */
export function loadEnvironment(): void {
  loadEnv({ path: ".env.local", override: true });
  loadEnv({ path: ".env", override: false });
}

/**
 * Validates required command line arguments
 */
export function validateArgs(
  args: (string | undefined)[],
  usage: string
): string[] {
  if (args.some((arg) => !arg)) {
    console.error(usage);
    process.exit(1);
  }
  
  return args as string[];
}

/**
 * Exits process with error message
 */
export function exitWithError(message: string, error?: unknown): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`${message}: ${errorMessage}`);
  process.exit(1);
}

/**
 * Logs success message with details
 */
export function logSuccess(message: string, details?: Record<string, unknown>): void {
  console.log(`✔ ${message}`);
  
  if (details) {
    Object.entries(details).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
}

/**
 * Parses comma-separated list from environment variable
 */
export function parseCommaSeparated(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Validates required environment variables
 */
export function validateEnvVars(
  vars: Record<string, string | undefined>
): void {
  const missing = Object.entries(vars)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
