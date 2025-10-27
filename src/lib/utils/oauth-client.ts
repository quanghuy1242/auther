/**
 * OAuth client configuration and management utilities
 */

export type TrustedClientConfig = {
  redirectSet: Set<string>;
  client: {
    redirectURLs: string[];
    metadata?: Record<string, unknown> | null;
  };
};

/**
 * Adds a redirect URI to a client configuration if not already present
 */
export function addRedirectToClient(
  config: TrustedClientConfig,
  redirectURI: string
): void {
  if (config.redirectSet.has(redirectURI)) {
    return;
  }
  
  config.redirectSet.add(redirectURI);
  config.client.redirectURLs.push(redirectURI);
}

/**
 * Checks if a redirect URI matches preview origin patterns
 */
export function isPreviewRedirect(
  redirectURI: string,
  previewOriginMatchers: RegExp[]
): boolean {
  if (!previewOriginMatchers.length) {
    return false;
  }
  
  if (previewOriginMatchers.some((regex) => regex.test(redirectURI))) {
    return true;
  }
  
  try {
    const origin = new URL(redirectURI).origin;
    return previewOriginMatchers.some((regex) => regex.test(origin));
  } catch {
    return false;
  }
}

/**
 * Registers a preview redirect URI for a client if applicable
 */
export function registerPreviewRedirect(
  clientId: string | null,
  redirectURI: string | null,
  dynamicRedirectConfig: Map<string, TrustedClientConfig>,
  previewOriginMatchers: RegExp[]
): void {
  if (!clientId || !redirectURI || !isPreviewRedirect(redirectURI, previewOriginMatchers)) {
    return;
  }

  const config = dynamicRedirectConfig.get(clientId);
  if (!config) {
    return;
  }

  addRedirectToClient(config, redirectURI);
}
