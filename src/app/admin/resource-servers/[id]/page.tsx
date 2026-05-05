import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeading } from "@/components/layout";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import { resourceServerRepository } from "@/lib/repositories";
import { deleteResourceServer } from "../actions";
import { ResourceServerForm } from "../resource-server-form";

type ResourceServerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ResourceServerDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const resourceServer = await resourceServerRepository.findById(id);

  return {
    title: resourceServer ? `${resourceServer.name} - Resource Server` : "Resource Server Not Found",
  };
}

export default async function ResourceServerDetailPage({ params }: ResourceServerDetailPageProps) {
  await guards.platform.admin();
  const { id } = await params;
  const resourceServer = await resourceServerRepository.findById(id);

  if (!resourceServer) {
    notFound();
  }

  return (
    <PageContainer maxWidth="4xl">
      <PageHeading
        title={resourceServer.name}
        description="Edit the API audience and lifecycle state used by resource-token issuance."
      />

      <div className="space-y-6">
        <ResourceServerForm mode="edit" resourceServer={resourceServer} />

        <Card>
          <CardHeader>
            <CardTitle>Delete Resource Server</CardTitle>
            <CardDescription>
              Delete only when no authorization spaces or issued-token contracts depend on this audience.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={deleteResourceServer} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={resourceServer.id} />
              <Button type="submit" variant="danger" size="sm" leftIcon="delete">
                Delete Resource Server
              </Button>
              <p className="text-sm text-gray-400">
                This removes the resource-server metadata from Auther. Existing deployments should be checked first.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
