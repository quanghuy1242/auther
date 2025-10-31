import type { Session } from "@/lib/session";
import { UserRepository } from "@/lib/repositories/user-repository";

const userRepo = new UserRepository();

/**
 * Check if the current user has admin role by checking the database
 */
export async function isAdmin(session: Session | null): Promise<boolean> {
  if (!session) {
    return false;
  }

  try {
    const user = await userRepo.findById(session.user.id);
    return (user as { role?: string })?.role === "admin";
  } catch (error) {
    console.error("Failed to check admin role:", error);
    return false;
  }
}
