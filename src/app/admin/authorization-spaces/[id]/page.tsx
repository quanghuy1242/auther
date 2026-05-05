import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeading } from "@/components/layout";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationSpaceRepository,
  resourceServerRepository,
} from "@/lib/repositories";
import { deleteAuthorizationSpace } from "../actions";
import { AuthorizationSpaceForm } from "../authorization-space-form";
import { SpaceDetailTabs } from "./space-detail-tabs";

type AuthorizationSpaceDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: AuthorizationSpaceDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const space = await authorizationSpaceRepository.findById(id);

  return {
    title: space ? `${space.name} - Authorization Space` : "Authorization Space Not Found",
  };
}

export default async function AuthorizationSpaceDetailPage({ params }: AuthorizationSpaceDetailPageProps) {
  await guards.platform.admin();
  const { id } = await params;
  const [space, resourceServers] = await Promise.all([
    authorizationSpaceRepository.findById(id),
    resourceServerRepository.findAll(),
  ]);

  if (!space) {
    notFound();
  }

  return (
    <PageContainer maxWidth="5xl">
      <PageHeading
        title={space.name}
        description="Manage this authorization boundary and the resource-server audience tied to it."
      />
      <SpaceDetailTabs spaceId={space.id} />

      <div className="space-y-6">
        <AuthorizationSpaceForm mode="edit" authorizationSpace={space} resourceServers={resourceServers} />

        <Card>
          <CardHeader>
            <CardTitle>Delete Authorization Space</CardTitle>
            <CardDescription>
              Delete only after all models have been moved or unassigned and no clients depend on this space.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteAuthorizationSpace} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={space.id} />
              <Button type="submit" variant="danger" size="sm" leftIcon="delete">
                Delete Authorization Space
              </Button>
              <p className="text-sm text-gray-400">
                This removes the space metadata. It should not be used as a shortcut for disabling a live domain.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
