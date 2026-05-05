import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessControl } from "@/components/admin/access-control/access-control";
import { PageContainer, PageHeading } from "@/components/layout";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, ResponsiveTable, Select } from "@/components/ui";
import { ClientProvider } from "@/app/admin/clients/[id]/client-context";
import { getClientById } from "@/app/admin/clients/[id]/actions";
import {
  getAuthorizationModels,
  getClientApiKeys,
  getClientMetadata,
  getCurrentUserAccessLevel,
  getGrantProjectionClientOptions,
  getPlatformAccessList,
  getScopedPermissions,
} from "@/app/admin/clients/[id]/access/actions";
import { guards } from "@/lib/auth/platform-guard";
import { resolveAuthorizationSpaceAccessClient } from "@/lib/auth/authorization-space-access-client";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  tupleRepository,
  userGroupRepository,
  userRepository,
} from "@/lib/repositories";
import type { AuthorizationModelEntity, Tuple } from "@/lib/repositories";
import { assignAuthorizationModelSpace } from "../../actions";
import { SpaceDetailTabs } from "../space-detail-tabs";
import { grantSpacePermission, revokeSpacePermission } from "./actions";

type AuthorizationSpaceAccessPageProps = {
  params: Promise<{ id: string }>;
};

type SubjectOption = {
  id: string;
  label: string;
};

async function getClientAccessInitialData(clientId: string, authorizationSpaceId: string) {
  const [accessLevel, metadata, accessList, modelsResult, scopedPerms, projectionClientOptions] = await Promise.all([
    getCurrentUserAccessLevel(clientId),
    getClientMetadata(clientId),
    getPlatformAccessList(clientId),
    getAuthorizationModels(clientId, authorizationSpaceId),
    getScopedPermissions(clientId, authorizationSpaceId),
    getGrantProjectionClientOptions(clientId),
  ]);

  const apiKeys = metadata.allowsApiKeys ? await getClientApiKeys(clientId, authorizationSpaceId) : [];

  return {
    accessLevel,
    metadata,
    accessList,
    models: modelsResult,
    scopedPerms,
    apiKeys,
    projectionClientOptions,
  };
}

export const metadata: Metadata = {
  title: "Authorization Space Access",
  description: "Manage model ownership and grants for an authorization space.",
};

function relationNames(model: AuthorizationModelEntity): string[] {
  return Object.keys(model.definition.relations ?? {}).sort();
}

function subjectLabel(tuple: Tuple, usersById: Map<string, SubjectOption>, groupsById: Map<string, SubjectOption>): string {
  if (tuple.subjectType === "user") {
    return usersById.get(tuple.subjectId)?.label ?? tuple.subjectId;
  }

  if (tuple.subjectType === "group") {
    return groupsById.get(tuple.subjectId)?.label ?? tuple.subjectId;
  }

  return tuple.subjectId;
}

export default async function AuthorizationSpaceAccessPage({ params }: AuthorizationSpaceAccessPageProps) {
  await guards.platform.admin();
  const { id } = await params;
  const [space, models, tuplesPage, usersPage, groups, accessClientResolution] = await Promise.all([
    authorizationSpaceRepository.findById(id),
    authorizationModelRepository.findAll(),
    tupleRepository.findByAuthorizationSpacePaginated({ authorizationSpaceId: id, limit: 200 }),
    userRepository.findManyWithAccounts(1, 500),
    userGroupRepository.findAll(),
    resolveAuthorizationSpaceAccessClient(id),
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
  const grantableModels = assignedModels.filter((model) => relationNames(model).length > 0);
  const modelRelationOptions = grantableModels.flatMap((model) =>
    relationNames(model).map((relation) => ({
      value: `${model.id}|${relation}`,
      label: `${model.entityType} / ${relation}`,
    })),
  );

  const userOptions: SubjectOption[] = usersPage.items
    .map((user) => ({
      id: user.id,
      label: `${user.name || user.email} (${user.email})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const groupOptions: SubjectOption[] = groups
    .map((group) => ({
      id: group.id,
      label: group.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const usersById = new Map(userOptions.map((user) => [user.id, user]));
  const groupsById = new Map(groupOptions.map((group) => [group.id, group]));
  const modelsByEntityType = new Map(assignedModels.map((model) => [model.entityType, model]));
  const subjectSelectOptions = [
    ...userOptions.map((user) => ({ value: `user|${user.id}`, label: `User: ${user.label}` })),
    ...groupOptions.map((group) => ({ value: `group|${group.id}`, label: `Group: ${group.label}` })),
  ];
  const accessClient = accessClientResolution
    ? await getClientById(accessClientResolution.clientId)
    : null;
  const accessClientInitialData = accessClient
    ? await getClientAccessInitialData(accessClient.clientId, space.id)
    : null;

  return (
    <PageContainer maxWidth="6xl">
      <PageHeading
        title={space.name}
        description="Manage the models and grants owned by this authorization space."
      />
      <SpaceDetailTabs spaceId={space.id} />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Model Ownership</CardTitle>
            <CardDescription>
              Models assigned here use this space as their grant boundary. Payload content models should belong to
              the Payload content space so projection and resource-token behavior stay aligned.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={assignAuthorizationModelSpace} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <input type="hidden" name="authorizationSpaceId" value={space.id} />
              <input type="hidden" name="currentSpaceId" value={space.id} />
              <div className="space-y-2">
                <Select
                  name="modelId"
                  label="Assign Model"
                  defaultValue={availableModels[0]?.id ?? ""}
                  options={
                    availableModels.length === 0
                      ? [{ value: "", label: "No available models", disabled: true }]
                      : availableModels.map((model) => ({
                          value: model.id,
                          label: `${model.entityType}${model.authorizationSpaceId ? " (assigned elsewhere)" : ""}`,
                        }))
                  }
                  disabled={availableModels.length === 0}
                />
                <p className="text-sm text-gray-400">
                  Assigning a model here may move it out of another space. Check integrations before moving live models.
                </p>
              </div>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={availableModels.length === 0}
                className="w-full md:mt-[1.6rem] md:w-auto"
              >
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
                          {relationNames(model).map((relation) => (
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
            <CardTitle>Space Grants</CardTitle>
            <CardDescription>
              Grant users or groups access to concrete resources in this space. OAuth clients only request tokens;
              resource permissions are managed here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={grantSpacePermission} className="grid gap-4 lg:grid-cols-2">
              <input type="hidden" name="spaceId" value={space.id} />
              <div>
                <Select
                  name="modelRelation"
                  label="Model And Relation"
                  defaultValue={modelRelationOptions[0]?.value ?? ""}
                  options={
                    modelRelationOptions.length === 0
                      ? [{ value: "", label: "No grantable models", disabled: true }]
                      : modelRelationOptions
                  }
                  disabled={modelRelationOptions.length === 0}
                />
                <p className="mt-2 text-sm text-gray-400">
                  Select the model/relation pair this grant should create.
                </p>
              </div>
              <div>
                <Input
                  id="grant-entity-id"
                  name="entityId"
                  label="Resource ID"
                  placeholder="*"
                  defaultValue="*"
                  helperText="Use * for all resources or a specific id such as a Payload book id."
                  disabled={modelRelationOptions.length === 0}
                />
              </div>
              <div>
                <Select
                  name="subject"
                  label="Subject"
                  defaultValue={subjectSelectOptions[0]?.value ?? ""}
                  options={
                    subjectSelectOptions.length === 0
                      ? [{ value: "", label: "No users or groups", disabled: true }]
                      : subjectSelectOptions
                  }
                  disabled={modelRelationOptions.length === 0 || (userOptions.length === 0 && groupOptions.length === 0)}
                />
                <p className="mt-2 text-sm text-gray-400">Choose the user or group receiving this resource grant.</p>
              </div>
              <div className="lg:col-span-2">
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  leftIcon="add"
                  disabled={modelRelationOptions.length === 0 || subjectSelectOptions.length === 0}
                >
                  Grant Access
                </Button>
              </div>
            </form>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-white">Current Grants</h3>
                <p className="mt-1 text-sm text-gray-400">
                  Showing the first 200 grants in this authorization space.
                </p>
              </div>
              {tuplesPage.tuples.length === 0 ? (
                <div className="rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-400">
                  No grants have been created in this space.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border-dark">
                  <ResponsiveTable
                    data={tuplesPage.tuples}
                    keyExtractor={(tuple) => tuple.id}
                    columns={[
                      {
                        key: "resource",
                        header: "Resource",
                        render: (tuple) => (
                          <div>
                            <p className="font-mono text-sm text-gray-200">
                              {modelsByEntityType.get(tuple.entityType)?.entityType ?? tuple.entityType}
                            </p>
                            <p className="text-xs text-gray-500">{tuple.entityId}</p>
                          </div>
                        ),
                      },
                      {
                        key: "relation",
                        header: "Relation",
                        render: (tuple) => <Badge variant="default">{tuple.relation}</Badge>,
                      },
                      {
                        key: "subject",
                        header: "Subject",
                        render: (tuple) => (
                          <div>
                            <p className="text-sm text-gray-200">{subjectLabel(tuple, usersById, groupsById)}</p>
                            <p className="text-xs text-gray-500">{tuple.subjectType}</p>
                          </div>
                        ),
                      },
                      {
                        key: "action",
                        header: "",
                        className: "text-right",
                        render: (tuple) => (
                          <form action={revokeSpacePermission}>
                            <input type="hidden" name="spaceId" value={space.id} />
                            <input type="hidden" name="tupleId" value={tuple.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Revoke
                            </Button>
                          </form>
                        ),
                      },
                    ]}
                    emptyMessage="No grants have been created in this space."
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access Control</CardTitle>
            <CardDescription>
              Manage this authorization space from one panel. API keys are stored through the canonical backing
              client that owns the space models, but grants and models remain scoped to this authorization space.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!accessClient || !accessClientInitialData ? (
              <div className="rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-400">
                No OAuth client is linked to this space yet. Link the model-owning client before managing API keys,
                scoped grants, or the data model here.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border-dark bg-black/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">Canonical Backing Client</h3>
                      <p className="mt-1 text-sm text-gray-400">
                        {accessClient.name || accessClient.clientId}
                      </p>
                      <p className="mt-1 font-mono text-xs text-gray-500">{accessClient.clientId}</p>
                    </div>
                    <Badge variant={accessClientResolution?.link.accessMode === "full" ? "success" : "default"}>
                      {accessClientResolution?.reason === "model_owner" ? "model owner" : accessClientResolution?.link.accessMode}
                    </Badge>
                  </div>
                </div>
                <ClientProvider client={accessClient}>
                  <AccessControl
                    initialData={accessClientInitialData}
                    authorizationSpaceId={space.id}
                    title="Authorization Space Access Control"
                    description="Manage API keys, scoped grants, and the data model for this authorization space."
                    showProjectionTargets={false}
                  />
                </ClientProvider>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
