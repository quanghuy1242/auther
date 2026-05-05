import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeading } from "@/components/layout";
import { Button } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  resourceServerRepository,
} from "@/lib/repositories";
import { AuthorizationSpacesClient, type AuthorizationSpaceListItem } from "./authorization-spaces-client";

export const metadata: Metadata = {
  title: "Authorization Spaces",
  description: "Manage first-class authorization spaces.",
};

export default async function AuthorizationSpacesPage() {
  await guards.platform.admin();
  const [spaces, resourceServers, models] = await Promise.all([
    authorizationSpaceRepository.findAll(),
    resourceServerRepository.findAll(),
    authorizationModelRepository.findAll(),
  ]);
  const resourceServerById = new Map(resourceServers.map((server) => [server.id, server]));
  const modelCountBySpaceId = new Map<string, number>();

  for (const model of models) {
    if (!model.authorizationSpaceId) {
      continue;
    }

    modelCountBySpaceId.set(
      model.authorizationSpaceId,
      (modelCountBySpaceId.get(model.authorizationSpaceId) ?? 0) + 1,
    );
  }

  const listItems: AuthorizationSpaceListItem[] = spaces.map((space) => {
    const resourceServer = space.resourceServerId
      ? resourceServerById.get(space.resourceServerId) ?? null
      : null;

    return {
      ...space,
      resourceServerName: resourceServer?.name ?? null,
      resourceServerAudience: resourceServer?.audience ?? null,
      modelCount: modelCountBySpaceId.get(space.id) ?? 0,
    };
  });

  return (
    <PageContainer>
      <PageHeading
        title="Authorization Spaces"
        description="Define model ownership boundaries independently from OAuth clients. Spaces group the models and grants that belong to one resource domain."
        action={
          <Link href="/admin/authorization-spaces/create">
            <Button variant="primary" size="sm" leftIcon="add">
              Create Authorization Space
            </Button>
          </Link>
        }
      />

      <AuthorizationSpacesClient spaces={listItems} />
    </PageContainer>
  );
}
