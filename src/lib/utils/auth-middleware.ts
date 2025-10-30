/**
 * Authentication middleware utilities
 */

import { INTERNAL_SIGNUP_SECRET_HEADER } from "../constants";

/**
 * Validates access to restricted signup paths
 */
export function validateInternalSignupAccess(
  request: Request,
  relativePath: string,
  restrictedPaths: Set<string>,
  expectedSecret: string
): void {
  if (!restrictedPaths.has(relativePath)) {
    return;
  }
  
  const headerSecret = request.headers.get(INTERNAL_SIGNUP_SECRET_HEADER);
  
  if (!headerSecret || headerSecret !== expectedSecret) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/**
 * Creates a set of restricted signup paths
 */
export function createRestrictedSignupPaths(): Set<string> {
  return new Set(["/sign-up/email", "/oauth2/register"]);
}
