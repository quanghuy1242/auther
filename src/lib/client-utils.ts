/**
 * Parses a newline or comma separated string of URLs into an array of trimmed strings.
 * Also supports JSON array strings.
 */
export function parseRedirectUrls(input: string | undefined | null): string[] {
  if (!input) return [];
  try {
    // Handle if input is JSON array string
    if (input.trim().startsWith("[") && input.trim().endsWith("]")) {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore JSON parse error, treat as text
  }

  return input
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

/**
 * Validates an array of URLs. Returns the first invalid URL found, or null if all are valid.
 */
export function findInvalidUrl(urls: string[]): string | null {
  for (const url of urls) {
    try {
      new URL(url);
    } catch {
      return url;
    }
  }
  return null;
}

/**
 * Parses a comma-separated string of grant types.
 * Also supports JSON array strings.
 */
export function parseGrantTypes(input: string | undefined | null): string[] {
  if (!input) return [];
  try {
    // Handle if input is JSON array string
    if (input.trim().startsWith("[") && input.trim().endsWith("]")) {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore JSON parse error, treat as comma separated
  }
  return input.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
}