import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeading } from "@/components/layout";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  oauthClientRepository,
  oauthClientSpaceLinkRepository,
  tupleRepository,
  userGroupRepository,
  userRepository,
} from "@/lib/repositories";
import type { AuthorizationModelEntity } from "@/lib/repositories";
import { assignAuthorizationModelSpace } from "../../actions";
import { SpaceDetailTabs } from "../space-detail-tabs";
import { grantSpacePermission } from "./actions";
import { SpaceGrantsTable } from "./space-grants-table";

type AuthorizationSpaceAccessPageProps = {
  params: Promise<{ id: string }>;
};

type SubjectOption = {
  id: string;
  label: string;
};

export const metadata: Metadata = {
  title: "Authorization Space Access",
  description: "Manage model ownership and grants for an authorization space.",
};

function relationNames(model: AuthorizationModelEntity): string[] {
  return Object.keys(model.definition.relations ?? {}).sort();
}

export default async function AuthorizationSpaceAccessPage({ params }: AuthorizationSpaceAccessPageProps) {
  await guards.platform.admin();
  const { id } = await params;
  const [space, models, tuplesPage, usersPage, groups, linkedClientRows] = await Promise.all([
    authorizationSpaceRepository.findById(id),
    authorizationModelRepository.findAll(),
    tupleRepository.findByAuthorizationSpacePaginated({ authorizationSpaceId: id, limit: 200 }),
    userRepository.findManyWithAccounts(1, 500),
    userGroupRepository.findAll(),
    oauthClientSpaceLinkRepository.listByAuthorizationSpaceId(id),
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
  const serviceAccountTuples = tuplesPage.tuples.filter((tuple) => tuple.subjectType === "apikey");
  const serviceAccountIds = Array.from(new Set(serviceAccountTuples.map((tuple) => tuple.subjectId))).sort();
  const linkedClients = (
    await Promise.all(
      linkedClientRows.map(async (link) => ({
        link,
        client: await oauthClientRepository.findByClientId(link.clientId),
      }))
    )
  ).sort((a, b) =>
    (a.client?.name ?? a.link.clientId).localeCompare(b.client?.name ?? b.link.clientId)
  );
  const subjectSelectOptions = [
    ...userOptions.map((user) => ({ value: `user|${user.id}`, label: `User: ${user.label}` })),
    ...groupOptions.map((group) => ({ value: `group|${group.id}`, label: `Group: ${group.label}` })),
  ];
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
                  <SpaceGrantsTable
                    tuples={tuplesPage.tuples}
                    modelsByEntityType={Object.fromEntries(modelsByEntityType)}
                    usersById={Object.fromEntries(usersById)}
                    groupsById={Object.fromEntries(groupsById)}
                    spaceId={space.id}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Accounts</CardTitle>
            <CardDescription>
              API keys are treated as service accounts in this authorization space. Creation and rotation should use
              the space-scoped service-account flow; legacy client-owned key creation is intentionally not exposed here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {serviceAccountIds.length === 0 ? (
              <div className="rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-400">
                No API-key service accounts currently have grants in this authorization space.
              </div>
            ) : (
              <div className="space-y-2">
                {serviceAccountIds.map((apiKeyId) => {
                  const grantCount = serviceAccountTuples.filter((tuple) => tuple.subjectId === apiKeyId).length;
                  return (
                    <div
                      key={apiKeyId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-dark bg-black/10 p-3"
                    >
                      <div>
                        <p className="font-mono text-sm text-gray-200">{apiKeyId}</p>
                        <p className="mt-1 text-xs text-gray-500">{grantCount} grant{grantCount === 1 ? "" : "s"}</p>
                      </div>
                      <Badge variant="default">apikey</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked Clients</CardTitle>
            <CardDescription>
              OAuth clients are integration and login channels for this space. They do not own the models or platform
              access grants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {linkedClients.length === 0 ? (
              <div className="rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-400">
                No OAuth clients are linked to this authorization space.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedClients.map(({ link, client }) => (
                  <div
                    key={link.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border-dark bg-black/10 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-200">{client?.name || link.clientId}</p>
                      <p className="mt-1 font-mono text-xs text-gray-500">{link.clientId}</p>
                    </div>
                    <Badge variant={link.accessMode === "full" ? "success" : "default"}>
                      {link.accessMode}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
