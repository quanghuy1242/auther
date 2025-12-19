import { getSession } from "@/lib/session";
import { PermissionService } from "@/lib/auth/permission-service";

const permissionService = new PermissionService();

export interface GuardResult {
    allowed: boolean;
    reason?: string;
}

/**
 * Check if the current user has a platform permission.
 * This is the core function for platform-level access control.
 *
 * @param entityType - The platform entity type (e.g., "platform", "webhooks", "users")
 * @param permission - The permission to check (e.g., "view", "create", "admin")
 * @param entityId - Optional specific entity ID, defaults to "*" for wildcard
 */
export async function checkPlatformPermission(
    entityType: string,
    permission: string,
    entityId: string = "*"
): Promise<GuardResult> {
    const session = await getSession();

    if (!session) {
        return { allowed: false, reason: "Not authenticated" };
    }

    try {
        const allowed = await permissionService.checkPermission(
            "user",
            session.user.id,
            entityType,
            entityId,
            permission
        );

        return {
            allowed,
            reason: allowed
                ? undefined
                : `Missing permission: ${entityType}:${permission}`,
        };
    } catch (error) {
        console.error("Permission check error:", error);
        return { allowed: false, reason: "Permission check failed" };
    }
}

/**
 * Require a platform permission - throws if not allowed.
 * Use this in server actions to guard operations.
 */
export async function requirePlatformPermission(
    entityType: string,
    permission: string,
    entityId: string = "*"
): Promise<void> {
    const result = await checkPlatformPermission(entityType, permission, entityId);

    if (!result.allowed) {
        throw new Error(result.reason || "Permission denied");
    }
}

/**
 * Check if user has platform member access (required for admin pages).
 * This is the minimum permission needed to access /admin/*.
 */
export async function hasPlatformAccess(): Promise<boolean> {
    const result = await checkPlatformPermission("platform", "member");
    return result.allowed;
}

/**
 * Require platform member access - throws redirect if not allowed.
 * Use in admin layouts to protect entire sections.
 */
export async function requirePlatformAccess(): Promise<void> {
    const hasAccess = await hasPlatformAccess();

    if (!hasAccess) {
        throw new Error("Forbidden - platform access required");
    }
}

// ========================================
// Convenience Guards
// ========================================

/**
 * Pre-built guards for common platform operations.
 * Usage: await guards.users.create();
 */
export const guards = {
    platform: {
        member: () => requirePlatformPermission("platform", "member"),
        admin: () => requirePlatformPermission("platform", "admin"),
        superAdmin: () => requirePlatformPermission("platform", "super_admin"),
        managePlatform: () => requirePlatformPermission("platform", "manage_platform"),
    },
    users: {
        view: () => requirePlatformPermission("users", "view"),
        create: () => requirePlatformPermission("users", "create"),
        update: () => requirePlatformPermission("users", "update"),
        delete: () => requirePlatformPermission("users", "delete"),
        ban: () => requirePlatformPermission("users", "ban"),
        impersonate: () => requirePlatformPermission("users", "impersonate"),
    },
    webhooks: {
        view: () => requirePlatformPermission("webhooks", "view"),
        create: () => requirePlatformPermission("webhooks", "create"),
        update: () => requirePlatformPermission("webhooks", "update"),
        delete: () => requirePlatformPermission("webhooks", "delete"),
        test: () => requirePlatformPermission("webhooks", "test"),
    },
    pipelines: {
        view: () => requirePlatformPermission("pipelines", "view"),
        create: () => requirePlatformPermission("pipelines", "create"),
        update: () => requirePlatformPermission("pipelines", "update"),
        delete: () => requirePlatformPermission("pipelines", "delete"),
        execute: () => requirePlatformPermission("pipelines", "execute"),
    },
    clients: {
        view: () => requirePlatformPermission("clients", "view"),
        create: () => requirePlatformPermission("clients", "create"),
        update: () => requirePlatformPermission("clients", "update"),
        delete: () => requirePlatformPermission("clients", "delete"),
        manageAccess: () => requirePlatformPermission("clients", "manage_access"),
    },
    keys: {
        view: () => requirePlatformPermission("keys", "view"),
        rotate: () => requirePlatformPermission("keys", "rotate"),
    },
    groups: {
        view: () => requirePlatformPermission("groups", "view"),
        create: () => requirePlatformPermission("groups", "create"),
        update: () => requirePlatformPermission("groups", "update"),
        delete: () => requirePlatformPermission("groups", "delete"),
        manageMembers: () => requirePlatformPermission("groups", "manage_members"),
    },
    sessions: {
        viewOwn: () => requirePlatformPermission("sessions", "view_own"),
        viewAll: () => requirePlatformPermission("sessions", "view_all"),
        revokeOwn: () => requirePlatformPermission("sessions", "revoke_own"),
        revokeAll: () => requirePlatformPermission("sessions", "revoke_all"),
    },
    apiKeys: {
        viewOwn: () => requirePlatformPermission("api_keys", "view_own"),
        viewAll: () => requirePlatformPermission("api_keys", "view_all"),
        create: () => requirePlatformPermission("api_keys", "create"),
        revoke: () => requirePlatformPermission("api_keys", "revoke"),
    },
};

// ========================================
// Check Helpers (non-throwing)
// ========================================

/**
 * Check helpers that return boolean instead of throwing.
 * Useful for conditional UI rendering.
 */
export const canUser = {
    platform: {
        member: () => checkPlatformPermission("platform", "member").then((r) => r.allowed),
        admin: () => checkPlatformPermission("platform", "admin").then((r) => r.allowed),
        superAdmin: () => checkPlatformPermission("platform", "super_admin").then((r) => r.allowed),
    },
    users: {
        view: () => checkPlatformPermission("users", "view").then((r) => r.allowed),
        create: () => checkPlatformPermission("users", "create").then((r) => r.allowed),
        update: () => checkPlatformPermission("users", "update").then((r) => r.allowed),
        delete: () => checkPlatformPermission("users", "delete").then((r) => r.allowed),
    },
    webhooks: {
        view: () => checkPlatformPermission("webhooks", "view").then((r) => r.allowed),
        create: () => checkPlatformPermission("webhooks", "create").then((r) => r.allowed),
        update: () => checkPlatformPermission("webhooks", "update").then((r) => r.allowed),
        delete: () => checkPlatformPermission("webhooks", "delete").then((r) => r.allowed),
    },
    pipelines: {
        view: () => checkPlatformPermission("pipelines", "view").then((r) => r.allowed),
        create: () => checkPlatformPermission("pipelines", "create").then((r) => r.allowed),
        update: () => checkPlatformPermission("pipelines", "update").then((r) => r.allowed),
        delete: () => checkPlatformPermission("pipelines", "delete").then((r) => r.allowed),
    },
    clients: {
        view: () => checkPlatformPermission("clients", "view").then((r) => r.allowed),
        create: () => checkPlatformPermission("clients", "create").then((r) => r.allowed),
    },
};
