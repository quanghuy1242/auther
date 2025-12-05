import { tupleRepository, authorizationModelRepository } from "@/lib/repositories";

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
 * Resolved tuple info for detailed permission data.
 */
export interface ResolvedTuple {
    entityType: string;
    entityId: string;
    relation: string;
    permissions: string[];
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
 */
export class ApiKeyPermissionResolver {
    /**
     * Resolve all permissions for an API key.
     * Returns a map of entityId → granted permissions.
     */
    async resolvePermissions(apiKeyId: string): Promise<ResolvedPermissions> {
        const permissions: ResolvedPermissions = {};

        // Step 1: Find all groups this API key belongs to
        // Tuple: { subjectType: 'apikey', subjectId: apiKeyId, relation: 'member', entityType: 'group' }
        const groupTuples = await tupleRepository.findBySubject("apikey", apiKeyId);

        const subjects = [
            { type: "apikey", id: apiKeyId }
        ];

        // Add groups to subject list
        for (const t of groupTuples) {
            if (t.entityType === "group" && t.relation === "member") {
                subjects.push({ type: "group", id: t.entityId });
            }
        }

        // Step 2: Find all tuples for the API key AND its groups
        const tuples = await tupleRepository.findBySubjects(subjects);

        if (tuples.length === 0) {
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

        return permissions;
    }

    /**
     * Resolve detailed permission info for an API key.
     * Returns full tuple context for debugging/admin views.
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
        relations: Record<string, string[]>
    ): boolean {
        // Direct match
        if (grantedRelation === requiredRelation) {
            return true;
        }

        // Check if grantedRelation implies requiredRelation
        // relations[requiredRelation] = array of relations that imply it
        const impliedBy = relations[requiredRelation] || [];
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
