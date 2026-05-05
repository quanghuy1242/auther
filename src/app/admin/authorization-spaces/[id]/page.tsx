import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeading } from "@/components/layout";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  resourceServerRepository,
} from "@/lib/repositories";
import { assignAuthorizationModelSpace, deleteAuthorizationSpace } from "../actions";
import { AuthorizationSpaceForm } from "../authorization-space-form";

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
  const [space, resourceServers, models] = await Promise.all([
    authorizationSpaceRepository.findById(id),
    resourceServerRepository.findAll(),
    authorizationModelRepository.findAll(),
  ]);

  if (!space) {
    notFound();
  }

  const assignedModels = models
    .filter((model) => model.authorizationSpaceId === space.id)
    .sort((a, b) => a.entityType.localeCompare(b.entityType));
  const availableModels = models
    .filter((model) => model.authorizationSpaceId !== space.id)
    .sort((a, b) => a.entityType.localeCompare(b.entityType));

  return (
    <PageContainer maxWidth="5xl">
      <PageHeading
        title={space.name}
        description="Manage this authorization boundary, its resource-server audience, and the models it owns."
      />

      <div className="space-y-6">
        <AuthorizationSpaceForm mode="edit" authorizationSpace={space} resourceServers={resourceServers} />

        <Card>
          <CardHeader>
            <CardTitle>Model Ownership</CardTitle>
            <CardDescription>
              Models assigned here use this space as their grant boundary. Payload content models should belong to
              the Payload content space so projection and resource-token behavior stay aligned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={assignAuthorizationModelSpace} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <input type="hidden" name="authorizationSpaceId" value={space.id} />
              <input type="hidden" name="currentSpaceId" value={space.id} />
              <div className="space-y-2">
                <label htmlFor="modelId" className="text-sm font-medium text-gray-200">
                  Assign Model
                </label>
                <select
                  id="modelId"
                  name="modelId"
                  className="w-full rounded-md border border-gray-700 bg-input px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  disabled={availableModels.length === 0}
                >
                  {availableModels.length === 0 ? (
                    <option>No available models</option>
                  ) : (
                    availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.entityType}
                        {model.authorizationSpaceId ? " (assigned elsewhere)" : ""}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-sm text-gray-400">
                  Assigning a model here may move it out of another space. Check integrations before moving live models.
                </p>
              </div>
              <Button type="submit" variant="secondary" size="sm" disabled={availableModels.length === 0}>
                Assign to Space
              </Button>
            </form>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-white">Models In This Space</h3>
                <p className="mt-1 text-sm text-gray-400">
                  These models define the object types and relations owned by this authorization space.
                </p>
              </div>
              {assignedModels.length === 0 ? (
                <div className="rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-400">
                  No models are assigned to this space yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {assignedModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-dark bg-black/10 p-3"
                    >
                      <div>
                        <p className="font-mono text-sm text-gray-200">{model.entityType}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.keys(model.definition.relations ?? {}).map((relation) => (
                            <Badge key={relation} variant="default">
                              {relation}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <form action={assignAuthorizationModelSpace}>
                        <input type="hidden" name="modelId" value={model.id} />
                        <input type="hidden" name="authorizationSpaceId" value="" />
                        <input type="hidden" name="currentSpaceId" value={space.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
