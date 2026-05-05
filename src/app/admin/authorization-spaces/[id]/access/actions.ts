"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  tupleRepository,
  userGroupRepository,
  userRepository,
} from "@/lib/repositories";

const grantSpacePermissionSchema = z.object({
  spaceId: z.string().min(1),
  modelRelation: z.string().min(1),
  entityId: z.string().trim().transform((value) => value || "*"),
  subject: z.string().min(1),
});

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
