/**
 * Authentication middleware utilities
 */

import { INTERNAL_SIGNUP_SECRET_HEADER } from "../constants";
import { metricsService } from "@/lib/services";

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
    // Metric: signup blocked due to missing or invalid secret
    void metricsService.count("auth.signup.blocked.count", 1, { reason: headerSecret ? "invalid_secret" : "missing_secret" });
    throw new Response("Forbidden", { status: 403 });
  }
}

/**
 * Creates a set of restricted signup paths
 */
export function createRestrictedSignupPaths(): Set<string> {
  return new Set(["/sign-up/email", "/oauth2/register"]);
}
