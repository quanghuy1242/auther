/**
 * ABAC (Attribute-Based Access Control) Context Utilities
 * 
 * This module provides types and helpers for building ABAC context objects
 * that are passed to Lua policy scripts for evaluation.
 */

/**
 * Resource attributes available to Lua policies.
 * 
 * @example
 * -- In Lua policy:
 * if context.resource.amount < 1000 then return true end
 * if context.resource.status == "draft" then return true end
 * if context.resource.owner_id == context.user.id then return true end
 */
export interface ResourceContext {
    /** Unique identifier of the resource */
    id?: string;
    /** Type of resource (e.g., "invoice", "report") */
    type?: string;
    /** Monetary amount (if applicable) */
    amount?: number;
    /** Current status (e.g., "draft", "published", "archived") */
    status?: string;
    /** ID of the resource owner */
    owner_id?: string;
    /** Department or team the resource belongs to */
    department?: string;
    /** Creation timestamp */
    created_at?: Date | string;
    /** Additional custom attributes */
    [key: string]: unknown;
}

/**
 * User attributes available to Lua policies.
 * 
 * @example
 * -- In Lua policy:
 * if context.user.role == "admin" then return true end
 * if context.user.department == "finance" then return true end
 */
export interface UserContext {
    /** User's unique identifier */
    id: string;
    /** User's display name */
    name?: string;
    /** User's email address */
    email?: string;
    /** User's role in the system */
    role?: string;
    /** User's department */
    department?: string;
    /** User's organization/tenant ID */
    organization_id?: string;
    /** Additional custom attributes */
    [key: string]: unknown;
}

/**
 * Complete ABAC context passed to Lua policy scripts.
 * 
 * @example
 * -- In Lua policy:
 * if context.action == "delete" and context.resource.owner_id ~= context.user.id then
 *   return false
 * end
 * return true
 */
export interface ABACContext {
    /** The resource being accessed */
    resource?: ResourceContext;
    /** The user performing the action */
    user?: UserContext;
    /** The action being performed */
    action?: "read" | "write" | "delete" | "create" | "admin" | string;
    /** Current timestamp (ISO string) */
    timestamp?: string;
    /** Request metadata */
    request?: {
        ip?: string;
        user_agent?: string;
        origin?: string;
    };
}

/**
 * Build an ABAC context object from partial inputs.
 * Adds timestamp automatically.
 * 
 * @example
 * const context = buildABACContext({
 *   user: { id: "user_123", role: "editor", department: "sales" },
 *   resource: { id: "invoice_456", amount: 500, status: "draft" },
 *   action: "delete"
 * });
 * 
 * const allowed = await permissionService.checkPermission(
 *   "user", userId, "invoice", invoiceId, "delete", context
 * );
 */
export function buildABACContext(partial: Partial<ABACContext> = {}): ABACContext {
    return {
        timestamp: new Date().toISOString(),
        ...partial,
    };
}

/**
 * Build user context from a session or user object.
 * 
 * @example
 * const userContext = buildUserContext({
 *   id: session.user.id,
 *   name: session.user.name,
 *   email: session.user.email,
 *   role: session.user.role,
 * });
 */
export function buildUserContext(user: Partial<UserContext> & { id: string }): UserContext {
    return {
        ...user,
    };
}

/**
 * Build resource context from entity data.
 * 
 * @example
 * const resourceContext = buildResourceContext({
 *   id: invoice.id,
 *   type: "invoice",
 *   amount: invoice.total,
 *   status: invoice.status,
 *   owner_id: invoice.createdBy,
 * });
 */
export function buildResourceContext(resource: Partial<ResourceContext>): ResourceContext {
    return {
        ...resource,
    };
}
