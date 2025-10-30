/**
 * HTTP utility functions
 */

/**
 * Extracts Bearer token from Authorization header
 */
export function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }
  
  const trimmed = headerValue.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  
  return trimmed.slice(7).trim() || null;
}

/**
 * Creates Basic Authorization header value
 */
export function createBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

/**
 * Checks if content type is JSON
 */
export function isJsonContentType(contentType: string | null): boolean {
  return contentType?.includes("application/json") ?? false;
}

/**
 * Extracts rows affected from database result
 */
export function extractRowsAffected(result: unknown): number {
  if (!result || typeof result !== "object") {
    return 0;
  }
  
  const rowsAffected = (result as { rowsAffected?: number }).rowsAffected;
  if (typeof rowsAffected === "number") {
    return rowsAffected;
  }

  const changes = (result as { changes?: number }).changes;
  if (typeof changes === "number") {
    return changes;
  }
  
  return 0;
}
