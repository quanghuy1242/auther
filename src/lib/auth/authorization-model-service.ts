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
      const [record] = await db
        .select()
        .from(authorizationModels)
        .where(eq(authorizationModels.entityType, entityType));

      if (record) {
        // The definition is stored as JSON in the DB
        return record.definition as AuthorizationModelDefinition;
      }

      // Fallback: Check System Key Models
      const systemModel = SYSTEM_MODELS.find(m => m.entityType === entityType);
      if (systemModel) {
        return systemModel;
      }

      return null;
    } catch (error) {
      console.error("AuthorizationModelService.getModel error:", error);
      return null;
    }
  }

  async upsertModel(entityType: string, definition: unknown): Promise<void> {
    try {
      // 1. Validate definition against Zod schema
      const parsedDefinition = authorizationModelSchema.parse(definition);

      // 2. Check for dependency safety
      const existingModel = await this.getModel(entityType);

      if (existingModel) {
        await this.checkDependencySafety(entityType, existingModel, parsedDefinition);
      }

      // 3. Upsert
      if (existingModel) {
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
        const tupleCount = await this.tupleRepo.countByRelation(entityType, relation);
        if (tupleCount > 0) {
          throw new Error(
            `Cannot remove relation '${relation}' from entity '${entityType}' because there are ${tupleCount} active permission tuples relying on it.`
          );
        }

        // Check if any registration context grants use it
        if (modelId) {
          const grantCount = await registrationContextRepo.countGrantsByEntityTypeIdAndRelation(modelId, relation);
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