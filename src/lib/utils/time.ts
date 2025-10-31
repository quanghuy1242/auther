/**
 * Time formatting utilities
 */

/**
 * Format a date as a relative time string (e.g., "2h ago", "5m ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const timestamp = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diff = now.getTime() - timestamp.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Format a date as an absolute time string
 */
export function formatAbsoluteTime(date: Date | string): string {
  const timestamp = date instanceof Date ? date : new Date(date);
  return timestamp.toLocaleString();
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
