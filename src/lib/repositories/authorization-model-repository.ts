import { db } from "@/lib/db";
import { authorizationModels } from "@/db/rebac-schema";
import { eq } from "drizzle-orm";
import { authorizationModelSchema, AuthorizationModelDefinition } from "@/schemas/rebac";
import { TupleRepository } from "./tuple-repository";
import { registrationContextRepo } from "./platform-access-repository";

export interface AuthorizationModelEntity {
    id: string;
    entityType: string;
    definition: AuthorizationModelDefinition;
    createdAt: Date;
    updatedAt: Date;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Repository for managing Authorization Models.
 * Wraps AuthorizationModelService functionality with repository pattern.
 */
export class AuthorizationModelRepository {
    private tupleRepo: TupleRepository;

    constructor(tupleRepo?: TupleRepository) {
        this.tupleRepo = tupleRepo ?? new TupleRepository();
    }

    /**
     * Find an authorization model by its entity type
     */
    async findByEntityType(entityType: string): Promise<AuthorizationModelEntity | null> {
        try {
            const [record] = await db
                .select()
                .from(authorizationModels)
                .where(eq(authorizationModels.entityType, entityType));

            if (!record) return null;

            return {
                id: record.id,
                entityType: record.entityType,
                definition: record.definition as AuthorizationModelDefinition,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
            };
        } catch (error) {
            console.error("AuthorizationModelRepository.findByEntityType error:", error);
            return null;
        }
    }

    /**
     * Find an authorization model by its ID (UUID)
     * Used for stable lookups that survive entity type renames.
     */
    async findById(id: string): Promise<AuthorizationModelEntity | null> {
        try {
            const [record] = await db
                .select()
                .from(authorizationModels)
                .where(eq(authorizationModels.id, id));

            if (!record) return null;

            return {
                id: record.id,
                entityType: record.entityType,
                definition: record.definition as AuthorizationModelDefinition,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
            };
        } catch (error) {
            console.error("AuthorizationModelRepository.findById error:", error);
            return null;
        }
    }

    /**
     * Find authorization model for a client (uses client_{clientId} entity type pattern)
     */
    async findByClientId(clientId: string): Promise<AuthorizationModelDefinition | null> {
        const entityType = `client_${clientId}`;
        const record = await this.findByEntityType(entityType);
        return record?.definition ?? null;
    }

    /**
     * Get all authorization models
     */
    async findAll(): Promise<AuthorizationModelEntity[]> {
        try {
            const records = await db.select().from(authorizationModels);
            return records.map(record => ({
                id: record.id,
                entityType: record.entityType,
                definition: record.definition as AuthorizationModelDefinition,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
            }));
        } catch (error) {
            console.error("AuthorizationModelRepository.findAll error:", error);
            return [];
        }
    }

    /**
     * Get all authorization models for a client (all entity types).
     * Uses pattern: client_{clientId}:{entityType} (e.g., "client_abc:invoice")
     * Returns a map of entityType -> definition
     */
    async findAllForClient(clientId: string): Promise<Record<string, AuthorizationModelDefinition>> {
        try {
            const prefix = `client_${clientId}:`;
            const records = await db.select().from(authorizationModels);

            const result: Record<string, AuthorizationModelDefinition> = {};
            for (const record of records) {
                if (record.entityType.startsWith(prefix)) {
                    const entityType = record.entityType.slice(prefix.length);
                    result[entityType] = record.definition as AuthorizationModelDefinition;
                }
            }
            return result;
        } catch (error) {
            console.error("AuthorizationModelRepository.findAllForClient error:", error);
            return {};
        }
    }

    /**
     * Get all authorization models for a client with their stable IDs.
     * Used for grant references that survive entity type renames.
     * Returns array of { id, name, relations }
     */
    async findAllForClientWithIds(clientId: string): Promise<Array<{
        id: string;
        name: string;
        relations: string[];
    }>> {
        try {
            const prefix = `client_${clientId}:`;
            const records = await db.select().from(authorizationModels);

            const result: Array<{ id: string; name: string; relations: string[] }> = [];
            for (const record of records) {
                if (record.entityType.startsWith(prefix)) {
                    const name = record.entityType.slice(prefix.length);
                    const definition = record.definition as AuthorizationModelDefinition;
                    const relations = Object.keys(definition.relations || {}).sort();
                    if (relations.length > 0) {
                        result.push({ id: record.id, name, relations });
                    }
                }
            }
            // Sort by name for consistent UI display
            result.sort((a, b) => a.name.localeCompare(b.name));
            return result;
        } catch (error) {
            console.error("AuthorizationModelRepository.findAllForClientWithIds error:", error);
            return [];
        }
    }

    /**
     * Upsert a specific entity type's model for a client.
     * Pattern: client_{clientId}:{entityType}
     */
    async upsertEntityTypeForClient(
        clientId: string,
        entityTypeName: string,
        definition: AuthorizationModelDefinition
    ): Promise<void> {
        const fullEntityType = `client_${clientId}:${entityTypeName}`;
        return this.upsert(fullEntityType, definition);
    }

    /**
     * Delete a specific entity type's model for a client.
     */
    async deleteEntityTypeForClient(
        clientId: string,
        entityTypeName: string
    ): Promise<{ deleted: boolean; error?: string }> {
        const fullEntityType = `client_${clientId}:${entityTypeName}`;
        return this.delete(fullEntityType);
    }

    /**
     * Pre-validate an update to an authorization model.
     * Checks for dependency safety without actually making the update.
     */
    async preValidateUpdate(
        entityType: string,
        newDefinition: AuthorizationModelDefinition
    ): Promise<ValidationResult> {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
        };

        try {
            // Validate against Zod schema
            const parseResult = authorizationModelSchema.safeParse(newDefinition);
            if (!parseResult.success) {
                result.valid = false;
                result.errors.push(...parseResult.error.issues.map((e: { message: string }) => e.message));
                return result;
            }

            // Check for dependency safety (removed relations)
            const existingModel = await this.findByEntityType(entityType);
            if (existingModel) {
                const oldRelations = Object.keys(existingModel.definition.relations);
                const newRelations = new Set(Object.keys(newDefinition.relations));

                for (const relation of oldRelations) {
                    if (!newRelations.has(relation)) {
                        const count = await this.tupleRepo.countByRelation(entityType, relation);
                        if (count > 0) {
                            result.valid = false;
                            result.errors.push(
                                `Cannot remove relation '${relation}' because there are ${count} active tuples using it.`
                            );
                        }
                    }
                }

                // Check for removed permissions (warning, not error)
                const oldPermissions = Object.keys(existingModel.definition.permissions || {});
                const newPermissions = new Set(Object.keys(newDefinition.permissions || {}));

                for (const permission of oldPermissions) {
                    if (!newPermissions.has(permission)) {
                        result.warnings.push(
                            `Permission '${permission}' is being removed. Ensure no code depends on it.`
                        );
                    }
                }
            }

            return result;
        } catch (error) {
            console.error("AuthorizationModelRepository.preValidateUpdate error:", error);
            result.valid = false;
            result.errors.push("Validation failed due to an internal error.");
            return result;
        }
    }

    /**
     * Upsert an authorization model (create or update)
     */
    async upsert(entityType: string, definition: AuthorizationModelDefinition): Promise<void> {
        try {
            // Validate against Zod schema
            const parsedDefinition = authorizationModelSchema.parse(definition);

            // Check for dependency safety
            const validation = await this.preValidateUpdate(entityType, parsedDefinition);
            if (!validation.valid) {
                throw new Error(validation.errors.join("; "));
            }

            const existing = await this.findByEntityType(entityType);

            if (existing) {
                await db
                    .update(authorizationModels)
                    .set({
                        definition: parsedDefinition,
                        updatedAt: new Date(),
                    })
                    .where(eq(authorizationModels.entityType, entityType));
            } else {
                await db.insert(authorizationModels).values({
                    id: crypto.randomUUID(),
                    entityType,
                    definition: parsedDefinition,
                });
            }
        } catch (error) {
            console.error("AuthorizationModelRepository.upsert error:", error);
            throw error;
        }
    }

    /**
     * Upsert authorization model for a client
     */
    async upsertForClient(clientId: string, definition: AuthorizationModelDefinition): Promise<void> {
        const entityType = `client_${clientId}`;
        return this.upsert(entityType, definition);
    }

    /**
     * Delete an authorization model by entity type
     * Only succeeds if no tuples or registration context grants reference its relations
     */
    async delete(entityType: string): Promise<{ deleted: boolean; error?: string }> {
        try {
            const existing = await this.findByEntityType(entityType);
            if (!existing) {
                return { deleted: false, error: "Model not found" };
            }

            // Check if any tuples or grants still reference this entity type
            const relations = Object.keys(existing.definition.relations);
            for (const relation of relations) {
                // Check tuples
                const tupleCount = await this.tupleRepo.countByRelation(entityType, relation);
                if (tupleCount > 0) {
                    return {
                        deleted: false,
                        error: `Cannot delete model: ${tupleCount} tuples still use relation '${relation}'`,
                    };
                }

                // Check registration context grants
                const grantCount = await registrationContextRepo.countGrantsByEntityTypeIdAndRelation(existing.id, relation);
                if (grantCount > 0) {
                    return {
                        deleted: false,
                        error: `Cannot delete model: ${grantCount} registration context grants still use relation '${relation}'`,
                    };
                }
            }

            await db
                .delete(authorizationModels)
                .where(eq(authorizationModels.entityType, entityType));

            return { deleted: true };
        } catch (error) {
            console.error("AuthorizationModelRepository.delete error:", error);
            return { deleted: false, error: "Failed to delete model" };
        }
    }

    /**
     * Update an authorization model's entity_type by its ID.
     * Used for renaming entity types.
     */
    async updateEntityType(id: string, newEntityType: string): Promise<{ success: boolean; error?: string }> {
        try {
            await db
                .update(authorizationModels)
                .set({
                    entityType: newEntityType,
                    updatedAt: new Date(),
                })
                .where(eq(authorizationModels.id, id));

            return { success: true };
        } catch (error) {
            console.error("AuthorizationModelRepository.updateEntityType error:", error);
            return { success: false, error: "Failed to update entity type" };
        }
    }
}
