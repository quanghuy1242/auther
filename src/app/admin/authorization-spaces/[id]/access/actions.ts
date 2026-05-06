"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AuthorizationSpaceServiceAccountService } from "@/lib/auth/authorization-space-service-account-service";
import { guards } from "@/lib/auth/platform-guard";
import { validateLuaSyntax } from "@/lib/auth/lua-validator";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  tupleRepository,
  userGroupRepository,
  userRepository,
} from "@/lib/repositories";
import type { AuthorizationModelDefinition } from "@/schemas/rebac";

const grantSpacePermissionSchema = z.object({
  spaceId: z.string().min(1),
  modelRelation: z.string().min(1),
  entityId: z.string().trim().transform((value) => value || "*"),
  subject: z.string().min(1),
});

const createServiceAccountSchema = z.object({
  spaceId: z.string().min(1),
  name: z.string().min(2),
  accessMode: z.enum(["scoped", "full_access"]),
  grants: z.array(z.object({
    modelId: z.string().min(1),
    relation: z.string().min(1),
  })).default([]),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

const serviceAccountService = new AuthorizationSpaceServiceAccountService();

type SpaceModelEditorTypeDefinition = {
  relations?: Record<string, unknown>;
  permissions?: Record<string, { relation?: string; policyEngine?: "lua"; policy?: string }>;
};

type SpaceModelEditorPayload = {
  types?: Record<string, SpaceModelEditorTypeDefinition>;
};

function modelKeyFromEntityType(entityType: string): string {
  return entityType.includes(":")
    ? entityType.slice(entityType.indexOf(":") + 1)
    : entityType;
}

function canonicalEntityType(spaceId: string, modelKey: string): string {
  return `space_${spaceId}:${modelKey}`;
}

function normalizeRelationSubjects(value: unknown): AuthorizationModelDefinition["relations"][string] {
  if (typeof value === "string") {
    return value.split("|").map((entry) => entry.trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (value && typeof value === "object") {
    const obj = value as { union?: unknown; subjectParams?: { hierarchy?: unknown } };
    const union = Array.isArray(obj.union)
      ? obj.union.map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    const subjectParams = obj.subjectParams && typeof obj.subjectParams === "object"
      ? { hierarchy: Boolean(obj.subjectParams.hierarchy) }
      : undefined;

    if (subjectParams || union.length > 0) {
      return subjectParams ? { union, subjectParams } : { union };
    }
  }

  return [];
}

function normalizeModelDefinition(input: SpaceModelEditorTypeDefinition): AuthorizationModelDefinition {
  const relations = Object.fromEntries(
    Object.entries(input.relations ?? {})
      .filter(([relation]) => relation.trim().length > 0)
      .map(([relation, subjects]) => [relation.trim(), normalizeRelationSubjects(subjects)])
  );

  const permissions = Object.fromEntries(
    Object.entries(input.permissions ?? {})
      .filter(([permission, definition]) => permission.trim().length > 0 && Boolean(definition?.relation?.trim()))
      .map(([permission, definition]) => {
        const permissionDefinition: { relation: string; policyEngine?: "lua"; policy?: string } = {
          relation: String(definition.relation).trim(),
        };
        if (definition.policyEngine === "lua" && definition.policy?.trim()) {
          permissionDefinition.policyEngine = "lua";
          permissionDefinition.policy = definition.policy;
        }
        return [permission.trim(), permissionDefinition];
      })
  );

  return { relations, permissions };
}

export async function updateSpaceAuthorizationModels(input: {
  spaceId: string;
  modelJson: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await guards.platform.admin();
    const space = await authorizationSpaceRepository.findById(input.spaceId);
    if (!space) {
      return { success: false, error: "Authorization space not found" };
    }

    const parsed = JSON.parse(input.modelJson) as SpaceModelEditorPayload;
    const types = parsed.types ?? {};
    const newModelKeys = new Set(Object.keys(types).map((key) => key.trim()).filter(Boolean));
    const existingModels = (await authorizationModelRepository.findAllForAuthorizationSpaceWithIds(space.id))
      .filter((model) => model.authorizationSpaceId === space.id);
    const existingModelKeys = new Set(existingModels.map((model) => modelKeyFromEntityType(model.entityType)));
    const removedKeys = [...existingModelKeys].filter((key) => !newModelKeys.has(key));
    const addedKeys = [...newModelKeys].filter((key) => !existingModelKeys.has(key));
    const renameMap = new Map<string, string>();

    if (removedKeys.length === 1 && addedKeys.length === 1) {
      renameMap.set(removedKeys[0], addedKeys[0]);
    }

    for (const [oldKey, newKey] of renameMap) {
      const model = existingModels.find((candidate) => modelKeyFromEntityType(candidate.entityType) === oldKey);
      if (!model) continue;

      const oldEntityType = model.entityType;
      const newEntityType = canonicalEntityType(space.id, newKey);
      const existingNewModel = await authorizationModelRepository.findByEntityType(newEntityType);
      if (existingNewModel) {
        return { success: false, error: `Model '${newKey}' already exists in this authorization space` };
      }

      await authorizationModelRepository.createAlias({
        authorizationModelId: model.id,
        authorizationSpaceId: space.id,
        aliasEntityType: oldEntityType,
        canonicalEntityType: newEntityType,
        source: "space_model_rename",
      });

      const renameResult = await authorizationModelRepository.updateEntityType(model.id, newEntityType);
      if (!renameResult.success) {
        return { success: false, error: renameResult.error ?? `Failed to rename '${oldKey}'` };
      }
      await tupleRepository.updateEntityTypeString(model.id, newEntityType);
      removedKeys.splice(removedKeys.indexOf(oldKey), 1);
      addedKeys.splice(addedKeys.indexOf(newKey), 1);
    }

    for (const [modelKey, rawDefinition] of Object.entries(types)) {
      const trimmedModelKey = modelKey.trim();
      if (!trimmedModelKey) continue;
      const definition = normalizeModelDefinition(rawDefinition);
      const entityType = canonicalEntityType(space.id, trimmedModelKey);

      for (const [permissionName, permissionDefinition] of Object.entries(definition.permissions ?? {})) {
        if (permissionDefinition.policyEngine === "lua" && permissionDefinition.policy) {
          const syntaxResult = await validateLuaSyntax(permissionDefinition.policy);
          if (!syntaxResult.valid) {
            return {
              success: false,
              error: `Invalid Lua policy for permission '${permissionName}': ${syntaxResult.error}`,
            };
          }
        }
      }

      const validation = await authorizationModelRepository.preValidateUpdate(entityType, definition);
      if (!validation.valid) {
        return { success: false, error: validation.errors.join("; ") };
      }

      await authorizationModelRepository.upsertForAuthorizationSpace({
        authorizationSpaceId: space.id,
        modelKey: trimmedModelKey,
        entityType,
        definition,
      });
    }

    for (const removedKey of removedKeys) {
      const model = existingModels.find((candidate) => modelKeyFromEntityType(candidate.entityType) === removedKey);
      if (!model) continue;
      const result = await authorizationModelRepository.delete(model.entityType);
      if (!result.deleted) {
        return { success: false, error: `Cannot delete '${removedKey}': ${result.error}` };
      }
    }

    revalidatePath(`/admin/authorization-spaces/${space.id}/access`);
    return { success: true };
  } catch (error) {
    console.error("updateSpaceAuthorizationModels error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update authorization models",
    };
  }
}

export async function grantSpacePermission(formData: FormData): Promise<void> {
  await guards.platform.admin();

  const validated = grantSpacePermissionSchema.parse({
    spaceId: String(formData.get("spaceId") ?? ""),
    modelRelation: String(formData.get("modelRelation") ?? ""),
    entityId: String(formData.get("entityId") ?? ""),
    subject: String(formData.get("subject") ?? ""),
  });
  const [modelId, relation] = validated.modelRelation.split("|");
  const [subjectType, subjectId] = validated.subject.split("|");

  if (!modelId || !relation) {
    throw new Error("Model and relation are required.");
  }

  if ((subjectType !== "user" && subjectType !== "group") || !subjectId) {
    throw new Error("Subject is required.");
  }

  const [space, model] = await Promise.all([
    authorizationSpaceRepository.findById(validated.spaceId),
    authorizationModelRepository.findById(modelId),
  ]);

  if (!space) {
    throw new Error("Authorization space not found.");
  }

  if (!model || model.authorizationSpaceId !== space.id) {
    throw new Error("Model does not belong to this authorization space.");
  }

  const validRelations = Object.keys(model.definition.relations ?? {});
  if (!validRelations.includes(relation)) {
    throw new Error(`Relation '${relation}' is not defined for '${model.entityType}'.`);
  }

  const subjectExists =
    subjectType === "user"
      ? Boolean(await userRepository.findById(subjectId))
      : Boolean(await userGroupRepository.findById(subjectId));

  if (!subjectExists) {
    throw new Error("Subject not found.");
  }

  await tupleRepository.create({
    entityType: model.entityType,
    entityTypeId: model.id,
    entityId: validated.entityId,
    relation,
    subjectType,
    subjectId,
    authorizationSpaceId: space.id,
  });

  revalidatePath(`/admin/authorization-spaces/${space.id}/access`);
}

export async function revokeSpacePermission(formData: FormData): Promise<void> {
  await guards.platform.admin();

  const spaceId = String(formData.get("spaceId") ?? "");
  const tupleId = String(formData.get("tupleId") ?? "");
  const tuple = await tupleRepository.findById(tupleId);

  if (!tuple || tuple.authorizationSpaceId !== spaceId) {
    throw new Error("Grant does not belong to this authorization space.");
  }

  await tupleRepository.deleteById(tupleId);
  revalidatePath(`/admin/authorization-spaces/${spaceId}/access`);
}

export async function createSpaceServiceAccount(input: z.input<typeof createServiceAccountSchema>) {
  await guards.platform.admin();
  const validated = createServiceAccountSchema.parse(input);

  const result = await serviceAccountService.create({
    authorizationSpaceId: validated.spaceId,
    name: validated.name,
    accessMode: validated.accessMode,
    grants: validated.grants,
    expiresInDays: validated.expiresInDays ?? null,
  });

  revalidatePath(`/admin/authorization-spaces/${validated.spaceId}/access`);
  return result;
}

export async function revokeSpaceServiceAccount(spaceId: string, serviceAccountId: string) {
  await guards.platform.admin();
  const result = await serviceAccountService.revoke(spaceId, serviceAccountId);
  revalidatePath(`/admin/authorization-spaces/${spaceId}/access`);
  return result;
}

export async function rotateSpaceServiceAccount(spaceId: string, serviceAccountId: string) {
  await guards.platform.admin();
  const result = await serviceAccountService.rotate(spaceId, serviceAccountId);
  revalidatePath(`/admin/authorization-spaces/${spaceId}/access`);
  return result;
}
