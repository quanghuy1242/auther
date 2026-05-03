import { Button, Card, CardContent, CardHeader, CardTitle, Label } from "@/components/ui";
import { guards } from "@/lib/auth/platform-guard";
import {
  authorizationSpaceRepository,
  oauthClientSpaceLinkRepository,
  type ClientSpaceAccessMode,
} from "@/lib/repositories";
import { createClientSpaceLink, deleteClientSpaceLink } from "./actions";

interface ClientSpacesPageProps {
  params: Promise<{ id: string }>;
}

const ACCESS_MODE_LABELS: Record<ClientSpaceAccessMode, string> = {
  login_only: "Login only",
  can_trigger_contexts: "Can trigger contexts",
  full: "Full",
};

export default async function ClientSpacesPage({ params }: ClientSpacesPageProps) {
  await guards.clients.view();
  const { id: clientId } = await params;
  const [links, spaces] = await Promise.all([
    oauthClientSpaceLinkRepository.listByClientId(clientId),
    authorizationSpaceRepository.findAll(),
  ]);
  const linkedSpaceIds = new Set(links.map((link) => link.authorizationSpaceId));
  const availableSpaces = spaces.filter((space) => !linkedSpaceIds.has(space.id));

  const createForClient = createClientSpaceLink.bind(null, clientId);
  const deleteForClient = deleteClientSpaceLink.bind(null, clientId);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Link Authorization Space</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createForClient} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="authorizationSpaceId">Authorization Space</Label>
              <select
                id="authorizationSpaceId"
                name="authorizationSpaceId"
                className="w-full rounded-md border border-slate-700 bg-input px-3 py-2 text-sm text-white"
              >
                {availableSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessMode">Access Mode</Label>
              <select
                id="accessMode"
                name="accessMode"
                defaultValue="login_only"
                className="w-full rounded-md border border-slate-700 bg-input px-3 py-2 text-sm text-white"
              >
                <option value="login_only">Login only</option>
                <option value="can_trigger_contexts">Can trigger contexts</option>
                <option value="full">Full</option>
              </select>
            </div>
            <Button type="submit" size="sm" disabled={availableSpaces.length === 0}>
              Link Space
            </Button>
          </form>
          {availableSpaces.length === 0 && (
            <p className="mt-3 text-sm text-gray-400">No unlinked spaces available.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked Spaces</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {links.map((link) => {
              const space = spaces.find((candidate) => candidate.id === link.authorizationSpaceId);
              return (
                <div key={link.id} className="flex items-center justify-between gap-4 rounded-lg border border-border-dark p-4">
                  <div>
                    <p className="font-medium text-white">{space?.name ?? link.authorizationSpaceId}</p>
                    <p className="text-sm text-gray-400">{ACCESS_MODE_LABELS[link.accessMode]}</p>
                  </div>
                  <form action={deleteForClient}>
                    <input type="hidden" name="id" value={link.id} />
                    <Button type="submit" size="sm" variant="danger">Remove</Button>
                  </form>
                </div>
              );
            })}
            {links.length === 0 && (
              <p className="text-sm text-gray-400">This client is not linked to any authorization spaces.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
