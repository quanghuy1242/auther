import { redirect } from "next/navigation";

import { guards } from "@/lib/auth/platform-guard";
import { oauthClientSpaceLinkRepository } from "@/lib/repositories";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AccessControlPage({ params }: PageProps) {
  await guards.clients.view();
  const { id } = await params;
  const links = await oauthClientSpaceLinkRepository.listByClientId(id);
  const firstSpaceId = links[0]?.authorizationSpaceId;

  if (firstSpaceId) {
    redirect(`/admin/authorization-spaces/${firstSpaceId}/access`);
  }

  redirect(`/admin/clients/${id}/spaces`);
}
