import Link from "next/link";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Select, Textarea } from "@/components/ui";
import type { AuthorizationSpaceEntity, ResourceServerEntity } from "@/lib/repositories";
import { createAuthorizationSpace, updateAuthorizationSpace } from "./actions";

type AuthorizationSpaceFormProps = {
  mode: "create" | "edit";
  authorizationSpace?: AuthorizationSpaceEntity;
  resourceServers: ResourceServerEntity[];
};

export function AuthorizationSpaceForm({
  mode,
  authorizationSpace,
  resourceServers,
}: AuthorizationSpaceFormProps) {
  const isEdit = mode === "edit";
  const onboardingAllowedTriggers = authorizationSpace?.onboardingAllowedTriggers
    .map((trigger) => `${trigger.kind}:${trigger.id}`)
    .join("\n") ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Authorization Space Settings" : "Create Authorization Space"}</CardTitle>
        <CardDescription>
          An authorization space owns resource models and grants. OAuth clients link to spaces; the space can
          point at the resource server whose access tokens protect those resources.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={isEdit ? updateAuthorizationSpace : createAuthorizationSpace} className="space-y-6">
          {authorizationSpace && <input type="hidden" name="id" value={authorizationSpace.id} />}

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              name="slug"
              label="Slug"
              required
              placeholder="payload-content"
              defaultValue={authorizationSpace?.slug}
              helperText="Stable identifier used by deployment configuration and token issuance."
            />
            <Input
              name="name"
              label="Name"
              required
              placeholder="Payload Content"
              defaultValue={authorizationSpace?.name}
              helperText="Human-readable label for operators."
            />
          </div>

          <Textarea
            name="description"
            label="Description"
            rows={4}
            defaultValue={authorizationSpace?.description ?? ""}
            helperText="Describe the resource boundary, for example Payload books, chapters, and comments."
          />

          <Select
            name="resourceServerId"
            label="Resource Server"
            defaultValue={authorizationSpace?.resourceServerId ?? ""}
            options={[
              { value: "", label: "None" },
              ...resourceServers.map((server) => ({
                value: server.id,
                label: `${server.name} (${server.audience})`,
              })),
            ]}
            placeholder="Select resource server"
          />
          <p className="-mt-4 text-sm text-gray-400">
            Select the API audience that should receive access tokens for this authorization boundary.
          </p>

          <div className="rounded-lg border border-border-dark bg-black/10 p-4">
            <Checkbox
              name="enabled"
              value="on"
              defaultChecked={authorizationSpace?.enabled ?? true}
              label="Enabled"
              className="items-start font-medium"
            />
            <p className="mt-2 pl-8 text-sm text-gray-400">
              Disabled spaces should not receive projected grants or resource-token issuance for linked clients.
            </p>
          </div>

          <div className="rounded-lg border border-border-dark bg-black/10 p-4 space-y-4">
            <Checkbox
              name="onboardingEnabled"
              value="on"
              defaultChecked={authorizationSpace?.onboardingEnabled ?? false}
              label="Enable public onboarding for this authorization space"
              className="items-start font-medium"
            />
            <Textarea
              name="onboardingAllowedTriggers"
              label="Allowed Onboarding Triggers"
              rows={4}
              defaultValue={onboardingAllowedTriggers}
              placeholder="oauth_client:blog-client-id&#10;resource_server:payload-resource-server-id"
              helperText="One trigger per line. Onboarding Flows in this space can only use principals listed here."
            />
            {resourceServers.length > 0 && (
              <p className="text-sm text-gray-400">
                Resource servers: {resourceServers.map((server) => `${server.name}=${server.id}`).join(", ")}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3 border-t border-border-dark pt-5">
            <Link href="/admin/authorization-spaces">
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="sm" leftIcon={isEdit ? "save" : "add"}>
              {isEdit ? "Save Changes" : "Create Authorization Space"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
