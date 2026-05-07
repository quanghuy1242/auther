"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  oauthClientSpaceLinkRepository,
  authorizationSpaceRepository,
} from "@/lib/repositories";

function boolFromForm(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function parseTriggerPrincipals(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [kind, ...idParts] = entry.split(":");
      const id = idParts.join(":").trim();
      if ((kind !== "oauth_client" && kind !== "resource_server") || !id) {
        throw new Error("Allowed triggers must use oauth_client:<id> or resource_server:<id>.");
      }
      return { kind: kind as "oauth_client" | "resource_server", id };
    });
}

function dataFromForm(formData: FormData) {
  return {
    slug: String(formData.get("slug") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    enabled: boolFromForm(formData.get("enabled")),
    resourceServerId: String(formData.get("resourceServerId") ?? "") || null,
    onboardingEnabled: boolFromForm(formData.get("onboardingEnabled")),
    onboardingAllowedTriggers: parseTriggerPrincipals(formData.get("onboardingAllowedTriggers")),
  };
}

async function assertOnboardingTriggersLinkedToSpace(
  authorizationSpaceId: string | null,
  data: ReturnType<typeof dataFromForm>
): Promise<void> {
  for (const trigger of data.onboardingAllowedTriggers) {
    if (trigger.kind === "resource_server") {
      if (!data.resourceServerId || trigger.id !== data.resourceServerId) {
        throw new Error("Resource-server onboarding triggers must match the space resource server.");
      }
      continue;
    }

    if (!authorizationSpaceId) {
      throw new Error("OAuth client onboarding triggers can be added after the space is created and linked.");
    }

    const link = await oauthClientSpaceLinkRepository.findByClientAndSpace(
      trigger.id,
      authorizationSpaceId
    );
    if (!link || (link.accessMode !== "can_trigger_contexts" && link.accessMode !== "full")) {
      throw new Error(
        `OAuth client '${trigger.id}' must be linked to this space with can_trigger_contexts or full access.`
      );
    }
  }
}

export async function createAuthorizationSpace(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const data = dataFromForm(formData);
  await assertOnboardingTriggersLinkedToSpace(null, data);
  const space = await authorizationSpaceRepository.create(data);
  revalidatePath("/admin/authorization-spaces");
  redirect(`/admin/authorization-spaces/${space.id}`);
}

export async function updateAuthorizationSpace(formData: FormData): Promise<void> {
  await guards.platform.admin();
  const id = String(formData.get("id") ?? "");
  const data = dataFromForm(formData);
  await assertOnboardingTriggersLinkedToSpace(id, data);
  await authorizationSpaceRepository.update(id, data);
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
