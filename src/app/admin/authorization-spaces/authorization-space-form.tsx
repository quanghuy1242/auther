import Link from "next/link";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from "@/components/ui";
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

          <div className="space-y-2">
            <label htmlFor="resourceServerId" className="text-sm font-medium text-gray-200">
              Resource Server
            </label>
            <select
              id="resourceServerId"
              name="resourceServerId"
              defaultValue={authorizationSpace?.resourceServerId ?? ""}
              className="w-full rounded-md border border-gray-700 bg-input px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <option value="">None</option>
              {resourceServers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.audience})
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-400">
              Select the API audience that should receive access tokens for this authorization boundary.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border-dark bg-black/10 p-4 text-sm text-gray-300">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={authorizationSpace?.enabled ?? true}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block font-medium text-white">Enabled</span>
              <span className="mt-1 block text-gray-400">
                Disabled spaces should not receive projected grants or resource-token issuance for linked clients.
              </span>
            </span>
          </label>

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
