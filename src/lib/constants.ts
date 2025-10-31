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
// WEBHOOK EVENT TYPES
// ============================================================================

export const WEBHOOK_EVENT_TYPES = [
  { value: "user.created", label: "User Created", description: "Triggered when a new user registers" },
  { value: "user.updated", label: "User Updated", description: "Triggered when user profile is updated" },
  { value: "user.deleted", label: "User Deleted", description: "Triggered when a user account is deleted" },
  { value: "user.verified", label: "User Verified", description: "Triggered when user verifies their email" },
  { value: "session.created", label: "Session Created", description: "Triggered when user signs in" },
  { value: "session.deleted", label: "Session Deleted", description: "Triggered when user signs out" },
  { value: "account.linked", label: "Account Linked", description: "Triggered when OAuth account is linked" },
  { value: "account.unlinked", label: "Account Unlinked", description: "Triggered when OAuth account is unlinked" },
  { value: "verification.sent", label: "Verification Sent", description: "Triggered when verification email is sent" },
  { value: "verification.completed", label: "Verification Completed", description: "Triggered when email is verified" },
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number]["value"];

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

// ============================================================================
// UI STYLING CONSTANTS
// ============================================================================

/**
 * Shared styling constants used across the application
 * These values must be used as inline styles, not in Tailwind arbitrary values
 * to avoid CSS parsing errors with hex colors.
 */
export const CARD_BG_COLOR = '#1a2632';
export const BORDER_COLOR_DATA = '#344d65'; // For tables and data sections
export const BORDER_COLOR_SUBTLE = 'rgba(255, 255, 255, 0.1)'; // For UI elements

/**
 * Common inline style objects for consistent styling
 */
export const cardBackgroundStyle = {
  backgroundColor: CARD_BG_COLOR,
} as const;

export const cardWithBorderStyle = {
  backgroundColor: CARD_BG_COLOR,
  borderColor: BORDER_COLOR_SUBTLE,
} as const;
