/**
 * Date and time formatting utilities
 * Centralized date formatting functions used across the admin interface
 */

/**
 * Format a date as relative time ago (e.g., "5 minutes ago", "2 days ago")
 * @param date - The date to format
 * @returns Human-readable relative time string
 * 
 * @example
 * formatTimeAgo(new Date(Date.now() - 300000)) // "5 minutes ago"
 * formatTimeAgo(new Date(Date.now() - 7200000)) // "2 hours ago"
 */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

/**
 * Format a date in long format with time (e.g., "January 15, 2024, 02:30 PM")
 * @param date - The date to format (can be null)
 * @returns Formatted date string or "—" if null
 * 
 * @example
 * formatDate(new Date(2024, 0, 15)) // "January 15, 2024, 02:30 PM"
 * formatDate(null) // "—"
 */
export function formatDate(date: Date | null): string {
  if (!date) return "—";
  
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/**
 * Format a date in short format without time (e.g., "Jan 15, 2024")
 * @param date - The date to format
 * @returns Formatted date string
 * 
 * @example
 * formatDateShort(new Date(2024, 0, 15)) // "Jan 15, 2024"
 */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/**
 * Format a duration in milliseconds as human-readable age
 * @param ageMs - Age in milliseconds
 * @returns Human-readable duration string
 * 
 * @example
 * formatAge(90000000) // "1 day 1 hour"
 * formatAge(7200000) // "2 hours"
 */
export function formatAge(ageMs: number): string {
  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ${hours} hour${hours > 1 ? "s" : ""}`;
  }
  return `${hours} hour${hours > 1 ? "s" : ""}`;
}
