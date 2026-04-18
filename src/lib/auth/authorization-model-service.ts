import { db } from "@/lib/db";
import { authorizationModels } from "@/db/rebac-schema";
import { eq } from "drizzle-orm";
import { authorizationModelSchema, AuthorizationModelDefinition } from "@/schemas/rebac";
import { TupleRepository } from "@/lib/repositories/tuple-repository";
import { registrationContextRepo } from "@/lib/repositories/platform-access-repository";

import { SYSTEM_MODELS } from "@/lib/auth/system-models";

export class AuthorizationModelService {
  private tupleRepo: TupleRepository;

  constructor() {
    this.tupleRepo = new TupleRepository();
  }

  async getModel(entityType: string): Promise<AuthorizationModelDefinition | null> {
    try {
      return await this.getModelStrict(entityType);
    } catch (error) {
      console.error("AuthorizationModelService.getModel error:", error);
      return null;
    }
  }

  /**
   * Strict model lookup that throws on DB/query failures.
   */
  async getModelStrict(entityType: string): Promise<AuthorizationModelDefinition | null> {
    const [record] = await db
      .select()
      .from(authorizationModels)
      .where(eq(authorizationModels.entityType, entityType));

    if (record) {
      return record.definition as AuthorizationModelDefinition;
    }

    const systemModel = SYSTEM_MODELS.find(m => m.entityType === entityType);
    if (systemModel) {
      return systemModel;
    }

    return null;
  }

  async upsertModel(entityType: string, definition: unknown): Promise<void> {
    try {
      // 1. Validate definition against Zod schema
      const parsedDefinition = authorizationModelSchema.parse(definition);

      const [persistedModelRecord] = await db
        .select({
          id: authorizationModels.id,
          definition: authorizationModels.definition,
        })
        .from(authorizationModels)
        .where(eq(authorizationModels.entityType, entityType));

      const existingPersistedModel = persistedModelRecord
        ? (persistedModelRecord.definition as AuthorizationModelDefinition)
        : null;
      const fallbackSystemModel = SYSTEM_MODELS.find(m => m.entityType === entityType) ?? null;
      const existingModel = existingPersistedModel ?? fallbackSystemModel;

      // 2. Check for dependency safety
      if (existingModel) {
        await this.checkDependencySafety(entityType, existingModel, parsedDefinition);
      }

      // 3. Upsert
      if (persistedModelRecord) {
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
      console.error("AuthorizationModelService.upsertModel error:", error);
      throw error; // Re-throw for the caller to handle (e.g., API error response)
    }
  }

  /**
   * Ensures that removing a relation/permission doesn't leave orphaned tuples or grants.
   */
  private async checkDependencySafety(
    entityType: string,
    oldModel: AuthorizationModelDefinition,
    newModel: AuthorizationModelDefinition
  ): Promise<void> {
    // Get the model ID for checking registration context grants
    const [modelRecord] = await db
      .select({ id: authorizationModels.id })
      .from(authorizationModels)
      .where(eq(authorizationModels.entityType, entityType));

    const modelId = modelRecord?.id;

    // Check for removed relations
    const oldRelations = Object.keys(oldModel.relations);
    const newRelations = new Set(Object.keys(newModel.relations));

    for (const relation of oldRelations) {
      if (!newRelations.has(relation)) {
        // Relation was removed. Check if any tuples use it.
        const tupleCount = await this.tupleRepo.countByRelationStrict(entityType, relation);
        if (tupleCount > 0) {
          throw new Error(
            `Cannot remove relation '${relation}' from entity '${entityType}' because there are ${tupleCount} active permission tuples relying on it.`
          );
        }

        // Check if any registration context grants use it
        if (modelId) {
          const grantCount = await registrationContextRepo.countGrantsByEntityTypeIdAndRelationStrict(modelId, relation);
          if (grantCount > 0) {
            throw new Error(
              `Cannot remove relation '${relation}' from entity '${entityType}' because there are ${grantCount} registration context grants using it.`
            );
          }
        }
      }
    }
  }
}