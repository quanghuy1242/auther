import Link from "next/link";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Textarea } from "@/components/ui";
import type { ResourceServerEntity } from "@/lib/repositories";
import { createResourceServer, updateResourceServer } from "./actions";

type ResourceServerFormProps = {
  mode: "create" | "edit";
  resourceServer?: ResourceServerEntity;
};

export function ResourceServerForm({ mode, resourceServer }: ResourceServerFormProps) {
  const isEdit = mode === "edit";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Resource Server Settings" : "Create Resource Server"}</CardTitle>
        <CardDescription>
          A resource server is the API audience that consumes access tokens. Payload should validate tokens
          against the Payload content API audience, not against an OAuth client id.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={isEdit ? updateResourceServer : createResourceServer} className="space-y-6">
          {resourceServer && <input type="hidden" name="id" value={resourceServer.id} />}

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              name="slug"
              label="Slug"
              required
              placeholder="payload-content-api"
              defaultValue={resourceServer?.slug}
              helperText="Stable admin identifier. Use lowercase text such as payload-content-api."
            />
            <Input
              name="name"
              label="Name"
              required
              placeholder="Payload Content API"
              defaultValue={resourceServer?.name}
              helperText="Human-readable label shown in admin screens."
            />
          </div>

          <Input
            name="audience"
            label="Audience"
            required
            placeholder="payload-content-api"
            defaultValue={resourceServer?.audience}
            helperText="The exact aud claim resource APIs verify. Keep it stable once clients depend on it."
          />

          <Textarea
            name="description"
            label="Description"
            rows={4}
            defaultValue={resourceServer?.description ?? ""}
            helperText="Explain which API this audience protects and which clients are expected to request it."
          />

          <div className="rounded-lg border border-border-dark bg-black/10 p-4">
            <Checkbox
              name="enabled"
              value="on"
              defaultChecked={resourceServer?.enabled ?? true}
              label="Enabled"
              className="items-start font-medium"
            />
            <p className="mt-2 pl-8 text-sm text-gray-400">
              Disabled resource servers should not be selected for new authorization spaces or accepted by
              resource-token issuance.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-border-dark pt-5">
            <Link href="/admin/resource-servers">
              <Button type="button" variant="ghost" size="sm">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="sm" leftIcon={isEdit ? "save" : "add"}>
              {isEdit ? "Save Changes" : "Create Resource Server"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
