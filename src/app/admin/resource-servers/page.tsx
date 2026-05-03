import type { Metadata } from "next";
import { PageContainer, PageHeading } from "@/components/layout";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import { resourceServerRepository } from "@/lib/repositories";
import { createResourceServer, deleteResourceServer, updateResourceServer } from "./actions";

export const metadata: Metadata = {
  title: "Resource Servers",
  description: "Manage resource server audiences.",
};

export default async function ResourceServersPage() {
  await guards.platform.admin();
  const resourceServers = await resourceServerRepository.findAll();

  return (
    <PageContainer>
      <PageHeading
        title="Resource Servers"
        description="Define API/resource audiences separately from OAuth clients."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create Resource Server</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createResourceServer} className="space-y-4">
              <Field name="slug" label="Slug" placeholder="payload-content-api" />
              <Field name="name" label="Name" placeholder="Payload Content API" />
              <Field name="audience" label="Audience" placeholder="payload-content-api" />
              <TextField name="description" label="Description" />
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4" />
                Enabled
              </label>
              <Button type="submit" size="sm">Create</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {resourceServers.map((server) => (
            <Card key={server.id}>
              <CardHeader>
                <CardTitle className="text-base">{server.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={updateResourceServer} className="grid gap-4 md:grid-cols-2">
                  <input type="hidden" name="id" value={server.id} />
                  <Field name="slug" label="Slug" defaultValue={server.slug} />
                  <Field name="name" label="Name" defaultValue={server.name} />
                  <Field name="audience" label="Audience" defaultValue={server.audience} />
                  <TextField name="description" label="Description" defaultValue={server.description ?? ""} />
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input name="enabled" type="checkbox" defaultChecked={server.enabled} className="h-4 w-4" />
                    Enabled
                  </label>
                  <div className="flex items-end gap-2">
                    <Button type="submit" size="sm" variant="secondary">Save</Button>
                  </div>
                </form>
                <form action={deleteResourceServer} className="mt-3">
                  <input type="hidden" name="id" value={server.id} />
                  <Button type="submit" size="sm" variant="danger">Delete</Button>
                </form>
              </CardContent>
            </Card>
          ))}
          {resourceServers.length === 0 && (
            <p className="text-sm text-gray-400">No resource servers configured.</p>
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
