import type { Metadata } from "next";
import { PageContainer, PageHeading } from "@/components/layout";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationModelRepository,
  authorizationSpaceRepository,
  resourceServerRepository,
} from "@/lib/repositories";
import {
  assignAuthorizationModelSpace,
  createAuthorizationSpace,
  deleteAuthorizationSpace,
  updateAuthorizationSpace,
} from "./actions";

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

  return (
    <PageContainer>
      <PageHeading
        title="Authorization Spaces"
        description="Define model ownership boundaries independently from OAuth clients."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create Space</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createAuthorizationSpace} className="space-y-4">
                <Field name="slug" label="Slug" placeholder="payload-content" />
                <Field name="name" label="Name" placeholder="Payload Content" />
                <TextField name="description" label="Description" />
                <ResourceServerSelect resourceServers={resourceServers} />
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4" />
                  Enabled
                </label>
                <Button type="submit" size="sm">Create</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model Ownership</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={assignAuthorizationModelSpace} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="modelId">Authorization Model</Label>
                  <select id="modelId" name="modelId" className="w-full rounded-md border border-slate-700 bg-input px-3 py-2 text-sm text-white">
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.entityType}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="authorizationSpaceId">Authorization Space</Label>
                  <select id="authorizationSpaceId" name="authorizationSpaceId" className="w-full rounded-md border border-slate-700 bg-input px-3 py-2 text-sm text-white">
                    <option value="">No space</option>
                    {spaces.map((space) => (
                      <option key={space.id} value={space.id}>
                        {space.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" size="sm" variant="secondary">Assign</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {spaces.map((space) => (
            <Card key={space.id}>
              <CardHeader>
                <CardTitle className="text-base">{space.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={updateAuthorizationSpace} className="grid gap-4 md:grid-cols-2">
                  <input type="hidden" name="id" value={space.id} />
                  <Field name="slug" label="Slug" defaultValue={space.slug} />
                  <Field name="name" label="Name" defaultValue={space.name} />
                  <TextField name="description" label="Description" defaultValue={space.description ?? ""} />
                  <ResourceServerSelect resourceServers={resourceServers} defaultValue={space.resourceServerId ?? ""} />
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input name="enabled" type="checkbox" defaultChecked={space.enabled} className="h-4 w-4" />
                    Enabled
                  </label>
                  <div className="flex items-end">
                    <Button type="submit" size="sm" variant="secondary">Save</Button>
                  </div>
                </form>
                <form action={deleteAuthorizationSpace} className="mt-3">
                  <input type="hidden" name="id" value={space.id} />
                  <Button type="submit" size="sm" variant="danger">Delete</Button>
                </form>
                <div className="mt-4 text-xs text-gray-400">
                  Models: {models.filter((model) => model.authorizationSpaceId === space.id).map((model) => model.entityType).join(", ") || "none"}
                </div>
              </CardContent>
            </Card>
          ))}
          {spaces.length === 0 && (
            <p className="text-sm text-gray-400">No authorization spaces configured.</p>
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function Field(props: {
  name: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Input id={props.name} name={props.name} placeholder={props.placeholder} defaultValue={props.defaultValue} />
    </div>
  );
}

function TextField(props: { name: string; label: string; defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{props.label}</Label>
      <Textarea id={props.name} name={props.name} defaultValue={props.defaultValue} rows={3} />
    </div>
  );
}

function ResourceServerSelect(props: {
  resourceServers: Array<{ id: string; name: string }>;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="resourceServerId">Resource Server</Label>
      <select
        id="resourceServerId"
        name="resourceServerId"
        defaultValue={props.defaultValue ?? ""}
        className="w-full rounded-md border border-slate-700 bg-input px-3 py-2 text-sm text-white"
      >
        <option value="">None</option>
        {props.resourceServers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.name}
          </option>
        ))}
      </select>
    </div>
  );
}
