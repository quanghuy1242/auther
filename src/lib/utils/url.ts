/**
 * URL and origin utility functions
 */

/**
 * Safely extracts origin from a URL string
 */
export function getOrigin(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/**
 * Collects unique origins from an iterable of URL strings
 */
export function collectOrigins(values: Iterable<string | undefined | null>): Set<string> {
  const origins = new Set<string>();
  
  for (const value of values) {
    const origin = getOrigin(value);
    if (origin) {
      origins.add(origin);
    }
  }
  
  return origins;
}

/**
 * Resolves relative pathname from a request URL given a base URL
 */
export function resolveRelativePath(requestUrl: URL, baseURL: string): string {
  const basePathname = new URL(baseURL).pathname;
  
  if (!requestUrl.pathname.startsWith(basePathname)) {
    return requestUrl.pathname;
  }
  
  return requestUrl.pathname.slice(basePathname.length) || "/";
}

/**
 * Resolves a base URL from environment variables or defaults
 */
export function resolveBaseUrl(
  productionUrl?: string,
  publicUrl?: string,
  vercelUrl?: string,
  defaultUrl = "http://localhost:3000"
): string {
  return (
    productionUrl ?? 
    publicUrl ?? 
    (vercelUrl ? `https://${vercelUrl}` : undefined) ?? 
    defaultUrl
  );
}
