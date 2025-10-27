/**
 * Authorization and authentication utility functions
 */

/**
 * Validates authorization header against an expected secret
 */
export function validateAuthorizationHeader(
  authorizationHeader: string | null,
  expectedSecret: string
): boolean {
  if (!authorizationHeader) {
    return false;
  }
  
  const trimmed = authorizationHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return false;
  }
  
  const token = trimmed.slice(7).trim();
  return token === expectedSecret;
}

/**
 * Validates custom header against an expected secret
 */
export function validateSecretHeader(
  headerValue: string | null,
  expectedSecret: string
): boolean {
  return headerValue === expectedSecret;
}

/**
 * Checks authorization using either Bearer token or custom header
 */
export function isAuthorizedRequest(
  authorizationHeader: string | null,
  customHeader: string | null,
  expectedSecret: string
): boolean {
  if (validateAuthorizationHeader(authorizationHeader, expectedSecret)) {
    return true;
  }
  
  if (validateSecretHeader(customHeader, expectedSecret)) {
    return true;
  }
  
  return false;
}
