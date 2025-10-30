import type { SessionUser } from "./session";

/**
 * Get formatted user display name
 */
export function getUserDisplayName(user: SessionUser): string {
  return user.displayUsername || user.username || user.name || user.email;
}

/**
 * Get user initials for avatar
 */
export function getUserInitials(user: SessionUser): string {
  const name = user.displayUsername || user.username || user.name;
  if (!name) return user.email.charAt(0).toUpperCase();

  const parts = name.split(" ");
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
