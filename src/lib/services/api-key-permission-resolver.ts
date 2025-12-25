import { tupleRepository, authorizationModelRepository } from "@/lib/repositories";
import { PermissionService } from "@/lib/auth/permission-service";
import { type ABACContext } from "@/lib/auth/abac-context";
import { metricsService } from "./metrics-service";

/**
 * Resolved permission structure for JWT payload.
 * Maps entity types to their granted permissions.
 * 
 * Example:
 * {
 *   "client_abc:invoice": ["read", "write"],
 *   "client_abc:report": ["read"]
 * }
 */
export type ResolvedPermissions = Record<string, string[]>;

/**
 * Resolved permission with ABAC info.
 */
export interface ResolvedPermissionWithPolicy {
    permission: string;
    hasPolicy: boolean; // If true, ABAC policy must be evaluated at runtime
}

/**
 * ABAC-aware permission resolution result.
 * Used in JWT payloads so consuming services know when to call /check-permission.
 * 
 * ARCHITECTURE NOTE:
 * - `permissions`: List of permissions granted by ReBAC relations
 * - `abac_required`: Subset of permissions that have ABAC policies attached
 * 
 * When a permission is in `abac_required`, the consuming service MUST call
 * POST /api/auth/check-permission with the actual resource context to get
 * a definitive access decision. The ABAC policy may deny access even if
 * the permission exists in the `permissions` array.
 * 
 * Example JWT payload:
 * {
 *   "permissions": { "client_abc:invoice": ["read", "write", "refund"] },
 *   "abac_required": { "client_abc:invoice": ["refund"] }
 * }
 * 
 * Client backend logic:
 * - "read" not in abac_required → allow without /check-permission call
 * - "refund" in abac_required → MUST call /check-permission with resource.amount
 */
export interface ResolvedPermissionsWithABAC {
    /** All permissions granted by ReBAC relations */
    permissions: ResolvedPermissions;
    /** Permissions that require ABAC evaluation at access time */
    abac_required: ResolvedPermissions;
}

/**
 * Resolved tuple info for detailed permission data.
 */
export interface ResolvedTuple {
    entityType: string;
    entityId: string;
    relation: string;
    permissions: string[];
    condition?: string | null; // ABAC condition from tuple
}

/**
 * ApiKeyPermissionResolver
 * 
 * Resolves effective permissions for an API key by:
 * 1. Looking up tuples where subjectType='apikey' and subjectId=apiKeyId
 * 2. For each tuple, loading the authorization model for the entity type
 * 3. Expanding permissions based on relation → permission mappings
 * 
 * This follows the ReBAC pattern where:
 * - Tuples define "apikey X has relation R on entity E"
 * - Authorization models define "permission P requires relation R"
 * - Resolved: "apikey X has permission P on entity E"
 * 
 * For ABAC:
 * - Use checkPermissionWithABAC() for runtime permission checks with context
 * - The standard resolvePermissions() returns what permissions *might* be allowed
 * - ABAC policies are evaluated at access time, not token generation
 */
export class ApiKeyPermissionResolver {
    private permissionService: PermissionService;

    constructor() {
        this.permissionService = new PermissionService();
    }

    /**
     * Check if an API key has a specific permission with ABAC evaluation.
     * This should be called at access time when context is available.
     * 
     * @param apiKeyId - The API key ID
     * @param entityType - The entity type (e.g., 'client_abc:invoice')
     * @param entityId - The specific entity ID (e.g., 'invoice_123')
     * @param permission - The permission to check (e.g., 'read', 'write')
     * @param context - ABAC context with resource/user attributes
     * @returns true if permission is granted and ABAC policy passes
     */
    async checkPermissionWithABAC(
        apiKeyId: string,
        entityType: string,
        entityId: string,
        permission: string,
        context: ABACContext = {}
    ): Promise<boolean> {
        return this.permissionService.checkPermission(
            "apikey",
            apiKeyId,
            entityType,
            entityId,
            permission,
            context as Record<string, unknown>
        );
    }

    /**
     * Resolve all permissions for an API key.
     * Returns a map of entityId → granted permissions.
     *
     * NOTE: This returns potential permissions. If ABAC policies are defined,
     * they must be evaluated at access time using checkPermissionWithABAC().
     */
    async resolvePermissions(apiKeyId: string): Promise<ResolvedPermissions> {
        const startTime = performance.now();
        const permissions: ResolvedPermissions = {};

        // Step 1: Find all groups this API key belongs to
        // Tuple: { subjectType: 'apikey', subjectId: apiKeyId, relation: 'member', entityType: 'group' }
        const groupTuples = await tupleRepository.findBySubject("apikey", apiKeyId);

        const subjects = [
            { type: "apikey", id: apiKeyId }
        ];

        // Add groups to subject list
        let groupCount = 0;
        for (const t of groupTuples) {
            if (t.entityType === "group" && t.relation === "member") {
                subjects.push({ type: "group", id: t.entityId });
                groupCount++;
            }
        }

        // Metric: groups count for this API key
        await metricsService.histogram("apikey.groups.count", groupCount);

        // Step 2: Find all tuples for the API key AND its groups
        const tuples = await tupleRepository.findBySubjects(subjects);

        if (tuples.length === 0) {
            const duration = performance.now() - startTime;
            await metricsService.histogram("apikey.resolve.duration_ms", duration);
            return permissions;
        }

        // Step 3: Group tuples by entity type for efficient model loading
        const tuplesByEntityType = new Map<string, typeof tuples>();
        for (const tuple of tuples) {
            // Skip group membership tuples (we already processed them)
            if (tuple.entityType === "group" && tuple.relation === "member") continue;

            const existing = tuplesByEntityType.get(tuple.entityType) || [];
            existing.push(tuple);
            tuplesByEntityType.set(tuple.entityType, existing);
        }

        // Step 4: For each entity type, load the model and resolve permissions
        for (const [entityType, entityTuples] of tuplesByEntityType) {
            const model = await authorizationModelRepository.findByEntityType(entityType);

            for (const tuple of entityTuples) {
                const entityKey = tuple.entityId === "*"
                    ? entityType
                    : `${entityType}:${tuple.entityId}`;

                if (!permissions[entityKey]) {
                    permissions[entityKey] = [];
                }

                if (model?.definition?.permissions) {
                    // Find all permissions that this relation grants
                    for (const [permName, permDef] of Object.entries(model.definition.permissions)) {
                        if (this.relationGrantsPermission(tuple.relation, permDef.relation, model.definition.relations)) {
                            if (!permissions[entityKey].includes(permName)) {
                                permissions[entityKey].push(permName);
                            }
                        }
                    }
                }

                // Always include the raw relation as a permission fallback
                if (!permissions[entityKey].includes(tuple.relation)) {
                    permissions[entityKey].push(tuple.relation);
                }
            }
        }

        // Metric: resolution duration
        const duration = performance.now() - startTime;
        await metricsService.histogram("apikey.resolve.duration_ms", duration);

        return permissions;
    }

    /**
     * Resolve all permissions for an API key with ABAC metadata.
     * Returns permissions AND which ones require ABAC evaluation at access time.
     *
     * USE THIS METHOD for JWT generation so consuming services know when
     * to call POST /api/auth/check-permission vs using JWT permissions directly.
     *
     * A permission requires ABAC evaluation if:
     * 1. The permission has a policy defined in the authorization model (permission-level ABAC)
     * 2. The tuple granting the permission has a condition attached (tuple-level ABAC)
     *
     * @param apiKeyId - The API key ID to resolve permissions for
     * @returns {permissions, abac_required} for JWT payload
     */
    async resolvePermissionsWithABACInfo(apiKeyId: string): Promise<ResolvedPermissionsWithABAC> {
        const startTime = performance.now();
        const permissions: ResolvedPermissions = {};
        const abac_required: ResolvedPermissions = {};

        // Step 1: Find all groups this API key belongs to
        const groupTuples = await tupleRepository.findBySubject("apikey", apiKeyId);
        const subjects = [{ type: "apikey", id: apiKeyId }];

        for (const t of groupTuples) {
            if (t.entityType === "group" && t.relation === "member") {
                subjects.push({ type: "group", id: t.entityId });
            }
        }

        // Step 2: Find all tuples for the API key AND its groups
        const tuples = await tupleRepository.findBySubjects(subjects);

        if (tuples.length === 0) {
            const duration = performance.now() - startTime;
            await metricsService.histogram("apikey.resolve.duration_ms", duration);
            return { permissions, abac_required };
        }

        // Step 3: Group tuples by entity type
        const tuplesByEntityType = new Map<string, typeof tuples>();
        for (const tuple of tuples) {
            if (tuple.entityType === "group" && tuple.relation === "member") continue;
            const existing = tuplesByEntityType.get(tuple.entityType) || [];
            existing.push(tuple);
            tuplesByEntityType.set(tuple.entityType, existing);
        }

        let abacRequiredCount = 0;

        // Step 4: For each entity type, resolve permissions and check for ABAC
        for (const [entityType, entityTuples] of tuplesByEntityType) {
            const model = await authorizationModelRepository.findByEntityType(entityType);

            for (const tuple of entityTuples) {
                const entityKey = tuple.entityId === "*"
                    ? entityType
                    : `${entityType}:${tuple.entityId}`;

                if (!permissions[entityKey]) {
                    permissions[entityKey] = [];
                }
                if (!abac_required[entityKey]) {
                    abac_required[entityKey] = [];
                }

                // Check if tuple itself has a condition (tuple-level ABAC)
                const tupleHasCondition = !!tuple.condition;

                if (model?.definition?.permissions) {
                    for (const [permName, permDef] of Object.entries(model.definition.permissions)) {
                        if (this.relationGrantsPermission(tuple.relation, permDef.relation, model.definition.relations)) {
                            if (!permissions[entityKey].includes(permName)) {
                                permissions[entityKey].push(permName);

                                // Check if permission has ABAC policy (permission-level ABAC)
                                const permissionHasPolicy = !!permDef.policy && permDef.policyEngine === "lua";

                                // Mark as ABAC required if either level has a policy
                                if ((permissionHasPolicy || tupleHasCondition) && !abac_required[entityKey].includes(permName)) {
                                    abac_required[entityKey].push(permName);
                                    abacRequiredCount++;
                                }
                            }
                        }
                    }
                }

                // Include raw relation as permission fallback
                if (!permissions[entityKey].includes(tuple.relation)) {
                    permissions[entityKey].push(tuple.relation);
                    // If tuple has condition, the relation itself needs ABAC
                    if (tupleHasCondition && !abac_required[entityKey].includes(tuple.relation)) {
                        abac_required[entityKey].push(tuple.relation);
                        abacRequiredCount++;
                    }
                }
            }
        }

        // Clean up: remove empty abac_required entries
        for (const key of Object.keys(abac_required)) {
            if (abac_required[key].length === 0) {
                delete abac_required[key];
            }
        }

        // Metrics
        const duration = performance.now() - startTime;
        await metricsService.histogram("apikey.resolve.duration_ms", duration);

        // Track how often ABAC is required
        if (abacRequiredCount > 0) {
            await metricsService.count("apikey.abac.required", abacRequiredCount);
        }

        return { permissions, abac_required };
    }

    /**
     * Resolve detailed permission info for an API key.
     * Returns full tuple context for debugging/admin views.
     * Includes ABAC condition info.
     */
    async resolveDetailedPermissions(apiKeyId: string): Promise<ResolvedTuple[]> {
        const result: ResolvedTuple[] = [];
        const tuples = await tupleRepository.findBySubject("apikey", apiKeyId);

        for (const tuple of tuples) {
            const model = await authorizationModelRepository.findByEntityType(tuple.entityType);
            const permissions: string[] = [tuple.relation];

            if (model?.definition?.permissions) {
                for (const [permName, permDef] of Object.entries(model.definition.permissions)) {
                    if (this.relationGrantsPermission(tuple.relation, permDef.relation, model.definition.relations)) {
                        if (!permissions.includes(permName)) {
                            permissions.push(permName);
                        }
                    }
                }
            }

            result.push({
                entityType: tuple.entityType,
                entityId: tuple.entityId,
                relation: tuple.relation,
                permissions,
                condition: tuple.condition, // Include ABAC condition
            });
        }

        return result;
    }

    /**
     * Check if a granted relation implies the required relation.
     * Uses transitivity: if A implies B and B implies C, then A implies C.
     * 
     * @param grantedRelation - The relation the subject has
     * @param requiredRelation - The relation needed for the permission
     * @param relations - The relation hierarchy from the model
     */
    private relationGrantsPermission(
        grantedRelation: string,
        requiredRelation: string,
        relations: Record<string, string[] | { union?: string[]; subjectParams?: { hierarchy?: boolean } }>
    ): boolean {
        // Direct match
        if (grantedRelation === requiredRelation) {
            return true;
        }

        // Check if grantedRelation implies requiredRelation
        // relations[requiredRelation] = definition of relations that imply it
        const def = relations[requiredRelation];
        let impliedBy: string[] = [];

        if (Array.isArray(def)) {
            impliedBy = def;
        } else if (def && typeof def === "object" && def.union) {
            impliedBy = def.union;
        }

        if (impliedBy.includes(grantedRelation)) {
            return true;
        }

        // Check transitivity: does grantedRelation imply something that implies requiredRelation?
        for (const implier of impliedBy) {
            if (this.relationGrantsPermission(grantedRelation, implier, relations)) {
                return true;
            }
        }

        return false;
    }
}

// Singleton instance for convenience
export const apiKeyPermissionResolver = new ApiKeyPermissionResolver();

