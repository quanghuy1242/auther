"use server";

import { revalidatePath } from "next/cache";
import { guards } from "@/lib/auth/platform-guard";
import { resourceServerRepository } from "@/lib/repositories";

function boolFromForm(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function dataFromForm(formData: FormData) {
  return {
    slug: String(formData.get("slug") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    audience: String(formData.get("audience") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    enabled: boolFromForm(formData.get("enabled")),
  };
}

export async function createResourceServer(formData: FormData): Promise<void> {
  await guards.platform.admin();
  await resourceServerRepository.create(dataFromForm(formData));
  revalidatePath("/admin/resource-servers");
}

export async function updateResourceServer(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const id = String(formData.get("id") ?? "");
  await resourceServerRepository.update(id, dataFromForm(formData));
  revalidatePath("/admin/resource-servers");
}

export async function deleteResourceServer(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const id = String(formData.get("id") ?? "");
  await resourceServerRepository.delete(id);
  revalidatePath("/admin/resource-servers");
}
