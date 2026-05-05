import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeading } from "@/components/layout";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
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
  const [space, models, tuplesPage, usersPage, groups] = await Promise.all([
    authorizationSpaceRepository.findById(id),
    authorizationModelRepository.findAll(),
    tupleRepository.findByAuthorizationSpacePaginated({ authorizationSpaceId: id, limit: 200 }),
    userRepository.findManyWithAccounts(1, 500),
    userGroupRepository.findAll(),
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
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={availableModels.length === 0}
                className="md:mt-[1.75rem]"
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
              <div className="space-y-2">
                <label htmlFor="grant-model-relation" className="text-sm font-medium text-gray-200">
                  Model And Relation
                </label>
                <select
                  id="grant-model-relation"
                  name="modelRelation"
                  className="w-full rounded-md border border-gray-700 bg-input px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  disabled={modelRelationOptions.length === 0}
                >
                  {modelRelationOptions.length === 0 ? (
                    <option>No grantable models</option>
                  ) : (
                    modelRelationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-sm text-gray-400">
                  Select the model/relation pair this grant should create.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="grant-entity-id" className="text-sm font-medium text-gray-200">
                  Resource ID
                </label>
                <input
                  id="grant-entity-id"
                  name="entityId"
                  placeholder="book_123"
                  className="w-full rounded-md border border-gray-700 bg-input px-3 py-2 text-sm text-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  disabled={modelRelationOptions.length === 0}
                />
                <p className="text-sm text-gray-400">Use the resource identifier from the consuming service, such as a Payload book id.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="grant-subject" className="text-sm font-medium text-gray-200">
                  Subject
                </label>
                <select
                  id="grant-subject"
                  name="subject"
                  className="w-full rounded-md border border-gray-700 bg-input px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  disabled={modelRelationOptions.length === 0 || (userOptions.length === 0 && groupOptions.length === 0)}
                >
                  <optgroup label="Users">
                    {userOptions.map((user) => (
                      <option key={user.id} value={`user|${user.id}`}>
                        {user.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Groups">
                    {groupOptions.map((group) => (
                      <option key={group.id} value={`group|${group.id}`}>
                        {group.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-sm text-gray-400">Choose the user or group receiving this resource grant.</p>
              </div>
              <div className="lg:col-span-2">
                <Button type="submit" size="sm" variant="primary" leftIcon="add" disabled={modelRelationOptions.length === 0}>
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
                  <table className="min-w-full divide-y divide-border-dark text-sm">
                    <thead className="bg-black/10 text-left text-xs uppercase text-gray-400">
                      <tr>
                        <th className="px-4 py-3">Resource</th>
                        <th className="px-4 py-3">Relation</th>
                        <th className="px-4 py-3">Subject</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dark">
                      {tuplesPage.tuples.map((tuple) => {
                        const model = modelsByEntityType.get(tuple.entityType);
                        return (
                          <tr key={tuple.id} className="bg-card">
                            <td className="px-4 py-3">
                              <p className="font-mono text-gray-200">{model?.entityType ?? tuple.entityType}</p>
                              <p className="text-xs text-gray-500">{tuple.entityId}</p>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="default">{tuple.relation}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-gray-200">{subjectLabel(tuple, usersById, groupsById)}</p>
                              <p className="text-xs text-gray-500">{tuple.subjectType}</p>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <form action={revokeSpacePermission}>
                                <input type="hidden" name="spaceId" value={space.id} />
                                <input type="hidden" name="tupleId" value={tuple.id} />
                                <Button type="submit" variant="ghost" size="sm">
                                  Revoke
                                </Button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
