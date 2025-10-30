// ============================================================================
// BASE URLs AND PATHS
// ============================================================================

export const DEFAULT_LOCAL_BASE_URL = "http://localhost:3000";
export const PAYLOAD_QUEUE_PATH = "/api/internal/queues/payload";
export const OAUTH_AUTHORIZE_PATH = "/oauth2/authorize" as const;

// ============================================================================
// REDIS KEYS
// ============================================================================

export const PROCESSED_WEBHOOK_SET_KEY = "webhooks:processed";

// ============================================================================
// WEBHOOK ORIGINS
// ============================================================================

export const WEBHOOK_ORIGIN_BETTER_AUTH = "better-auth" as const;
export const WEBHOOK_ORIGIN_PAYLOAD = "payload" as const;

// ============================================================================
// HTTP HEADERS
// ============================================================================

export const INTERNAL_SIGNUP_SECRET_HEADER = "x-internal-signup-secret" as const;
export const BETTER_AUTH_USER_ID_HEADER = "x-better-auth-user-id" as const;
export const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature" as const;
export const WEBHOOK_TIMESTAMP_HEADER = "x-webhook-timestamp" as const;
export const WEBHOOK_ID_HEADER = "x-webhook-id" as const;
export const WEBHOOK_ORIGIN_HEADER = "x-webhook-origin" as const;
export const QSTASH_SIGNATURE_HEADER = "upstash-signature" as const;

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

export const DEFAULT_CORS_METHODS = ["GET", "POST", "OPTIONS"] as const;
export const DEFAULT_CORS_HEADERS = [
  "Content-Type",
  "Authorization",
  INTERNAL_SIGNUP_SECRET_HEADER,
] as const;

// ============================================================================
// TIME INTERVALS (in milliseconds)
// ============================================================================

export const JWKS_ROTATION_INTERVAL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const JWKS_RETENTION_WINDOW_MS = JWKS_ROTATION_INTERVAL_MS * 2; // 60 days
export const WEBHOOK_MAX_AGE_MS = 5 * 60_000; // 5 minutes
export const WEBHOOK_IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 48; // 48 hours

/**
 * Get human-readable rotation cadence display
 */
export function getRotationCadenceDisplay(ms: number = JWKS_ROTATION_INTERVAL_MS): string {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return `${days} days`;
}
