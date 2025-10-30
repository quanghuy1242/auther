/**
 * User agent parsing utilities
 * Extracts browser/device information from user agent strings
 */

/**
 * Parse a user agent string to extract browser/device name
 * @param ua - User agent string (can be null)
 * @returns Simplified browser/device name
 * 
 * @example
 * parseUserAgent("Mozilla/5.0 ... Chrome/91.0") // "Chrome"
 * parseUserAgent("Mozilla/5.0 ... Firefox/89.0") // "Firefox"
 * parseUserAgent(null) // "Unknown Device"
 */
export function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown Device";
  
  // Simple parsing for common browsers and OS
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  if (ua.includes("Mobile")) return "Mobile Browser";
  
  return "Web Browser";
}
