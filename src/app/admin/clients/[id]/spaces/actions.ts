"use server";

import { revalidatePath } from "next/cache";
import { guards } from "@/lib/auth/platform-guard";
import {
  oauthClientSpaceLinkRepository,
  type ClientSpaceAccessMode,
} from "@/lib/repositories";

function accessModeFromForm(value: FormDataEntryValue | null): ClientSpaceAccessMode {
  if (value === "can_trigger_contexts" || value === "full") {
    return value;
  }
  return "login_only";
}

export async function createClientSpaceLink(
  clientId: string,
  formData: FormData
): Promise<void> {
  await guards.clients.update();
  await oauthClientSpaceLinkRepository.create({
    clientId,
    authorizationSpaceId: String(formData.get("authorizationSpaceId") ?? ""),
    accessMode: accessModeFromForm(formData.get("accessMode")),
  });
  revalidatePath(`/admin/clients/${clientId}/spaces`);
  revalidatePath(`/admin/clients/${clientId}/registration`);
}

export async function deleteClientSpaceLink(
  clientId: string,
  formData: FormData
): Promise<void> {
  await guards.clients.update();
  await oauthClientSpaceLinkRepository.delete(String(formData.get("id") ?? ""));
  revalidatePath(`/admin/clients/${clientId}/spaces`);
  revalidatePath(`/admin/clients/${clientId}/registration`);
}
