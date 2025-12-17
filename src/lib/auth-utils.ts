import type { Session } from "@/lib/session";
import { UserRepository } from "@/lib/repositories/user-repository";
import { PermissionService } from "@/lib/auth/permission-service";

const userRepo = new UserRepository();
const permissionService = new PermissionService();

/**
 * Check if the current user has admin role.
 * Uses platform permissions first, falls back to role field for migration.
 */
export async function isAdmin(session: Session | null): Promise<boolean> {
  if (!session) {
    return false;
  }

  try {
    // First check platform permissions (new system)
    const hasPermission = await permissionService.checkPermission(
      "user",
      session.user.id,
      "platform",
      "*",
      "member" // Minimum permission for admin access
    );

    if (hasPermission) {
      return true;
    }

    // Fallback: check legacy role field for migration period
    const user = await userRepo.findById(session.user.id);
    return (user as { role?: string })?.role === "admin";
  } catch (error) {
    console.error("Failed to check admin access:", error);
    return false;
  }
}

/**
 * Check if user has a specific platform permission.
 */
export async function hasPlatformPermission(
  session: Session | null,
  entityType: string,
  permission: string
): Promise<boolean> {
  if (!session) {
    return false;
  }

  try {
    return await permissionService.checkPermission(
      "user",
      session.user.id,
      entityType,
      "*",
      permission
    );
  } catch (error) {
    console.error("Failed to check platform permission:", error);
    return false;
  }
}

/**
 * Get user's platform access level.
 * Returns: 'super_admin' | 'admin' | 'member' | null
 */
export async function getPlatformAccessLevel(
  session: Session | null
): Promise<string | null> {
  if (!session) {
    return null;
  }

  try {
    // Check from highest to lowest
    const levels = ["super_admin", "admin", "member"];

    for (const level of levels) {
      const hasLevel = await permissionService.checkPermission(
        "user",
        session.user.id,
        "platform",
        "*",
        level
      );
      if (hasLevel) {
        return level;
      }
    }

    // Fallback to legacy role
    const user = await userRepo.findById(session.user.id);
    if ((user as { role?: string })?.role === "admin") {
      return "admin"; // Legacy admin maps to admin level
    }

    return null;
  } catch (error) {
    console.error("Failed to get platform access level:", error);
    return null;
  }
}
