import type { Session } from "@/lib/session";

/**
 * Check if the current user has admin role
 */
export function isAdmin(session: Session | null): boolean {
  return session?.user?.role === "admin";
}
