"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
} from "@/lib/repositories";

function boolFromForm(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function dataFromForm(formData: FormData) {
  return {
    slug: String(formData.get("slug") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    enabled: boolFromForm(formData.get("enabled")),
    resourceServerId: String(formData.get("resourceServerId") ?? "") || null,
  };
}

export async function createAuthorizationSpace(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const space = await authorizationSpaceRepository.create(dataFromForm(formData));
  revalidatePath("/admin/authorization-spaces");
  redirect(`/admin/authorization-spaces/${space.id}`);
}

export async function updateAuthorizationSpace(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const id = String(formData.get("id") ?? "");
  await authorizationSpaceRepository.update(id, dataFromForm(formData));
  revalidatePath("/admin/authorization-spaces");
  revalidatePath(`/admin/authorization-spaces/${id}`);
}

export async function deleteAuthorizationSpace(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const id = String(formData.get("id") ?? "");
  await authorizationSpaceRepository.delete(id);
  revalidatePath("/admin/authorization-spaces");
  redirect("/admin/authorization-spaces");
}

export async function assignAuthorizationModelSpace(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const modelId = String(formData.get("modelId") ?? "");
  const authorizationSpaceId = String(formData.get("authorizationSpaceId") ?? "") || null;
  const currentSpaceId = String(formData.get("currentSpaceId") ?? "") || null;
  await authorizationModelRepository.updateAuthorizationSpace(modelId, authorizationSpaceId);
  revalidatePath("/admin/authorization-spaces");
  if (authorizationSpaceId) {
    revalidatePath(`/admin/authorization-spaces/${authorizationSpaceId}`);
  }
  if (currentSpaceId) {
    revalidatePath(`/admin/authorization-spaces/${currentSpaceId}`);
  }
  revalidatePath("/admin/access");
}
