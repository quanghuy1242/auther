"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Icon, Label, Modal } from "@/components/ui";
import { 
  updateClient, 
  rotateClientSecret, 
  toggleClientStatus,
  deleteClient,
  type ClientDetail,
  type UpdateClientState 
} from "./actions";

interface ClientDetailClientProps {
  client: ClientDetail;
}

export function ClientDetailClient({ client }: ClientDetailClientProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = React.useState(false);
  const [showRotateModal, setShowRotateModal] = React.useState(false);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [showSecretModal, setShowSecretModal] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<"id" | "secret" | null>(null);

  const updateWithClientId = updateClient.bind(null, client.clientId);
  const [updateState, updateAction] = useFormState<UpdateClientState, FormData>(
    updateWithClientId,
    { success: false }
  );

  React.useEffect(() => {
    if (updateState.success) {
      setIsEditing(false);
      window.location.reload();
    }
  }, [updateState.success]);

  const handleRotateSecret = async () => {
    const result = await rotateClientSecret(client.clientId);
    setShowRotateModal(false);
    if (result.success && result.secret) {
      setNewSecret(result.secret);
      setShowSecretModal(true);
    }
  };

  const handleToggleStatus = async () => {
    await toggleClientStatus(client.clientId, !client.disabled);
    window.location.reload();
  };

  const handleDelete = async () => {
    const result = await deleteClient(client.clientId);
    setShowDeleteModal(false);
    if (result.success) {
      router.push("/admin/clients");
    }
  };

  const copyToClipboard = (text: string, type: "id" | "secret") => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Never";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const formatDateShort = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(date));
  };

  const isTrusted = client.metadata.trusted || client.userId === null;
  const isConfidential = client.clientSecret !== null;

  return (
    <>
      {/* Client Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-[#1773cf]/20 flex items-center justify-center border border-[#1773cf]/30">
            <Icon name="apps" className="text-[#1773cf] text-3xl" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-black text-white tracking-tight">{client.name || "Unnamed Client"}</h1>
            <div className="flex items-center gap-2">
              {isTrusted && (
                <Badge variant="info" dot>
                  Trusted
                </Badge>
              )}
              {client.disabled ? (
                <Badge variant="danger" dot>Disabled</Badge>
              ) : (
                <Badge variant="success" dot>Active</Badge>
              )}
              <span className="text-sm text-gray-400">{client.type || "Unknown Type"}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={client.disabled ? "primary" : "secondary"}
            size="sm"
            onClick={handleToggleStatus}
          >
            {client.disabled ? "Enable Client" : "Disable Client"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete Client
          </Button>
        </div>
      </div>

      {/* Client Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Client Configuration</CardTitle>
                <Button
                  variant={isEditing ? "secondary" : "primary"}
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? "Cancel" : "Edit"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form action={updateAction} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Client Name</Label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      defaultValue={client.name || ""}
                      className="w-full px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1773cf] focus:border-transparent mt-1"
                      required
                    />
                    {updateState.errors?.name && (
                      <p className="text-sm text-red-500 mt-1">{updateState.errors.name}</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="redirectURLs">Redirect URIs</Label>
                    <textarea
                      id="redirectURLs"
                      name="redirectURLs"
                      defaultValue={client.redirectURLs.join("\n")}
                      className="w-full px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1773cf] focus:border-transparent resize-y min-h-[120px] mt-1"
                      required
                    />
                    <p className="text-sm text-gray-400 mt-1">One URL per line</p>
                    {updateState.errors?.redirectURLs && (
                      <p className="text-sm text-red-500 mt-1">{updateState.errors.redirectURLs}</p>
                    )}
                  </div>
                  {updateState.error && (
                    <p className="text-sm text-red-500">{updateState.error}</p>
                  )}
                  <Button type="submit" variant="primary">
                    Save Changes
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-gray-400">Client Name</Label>
                    <p className="text-base text-white mt-1">{client.name || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-gray-400">Redirect URIs</Label>
                    <div className="mt-2 space-y-2">
                      {client.redirectURLs.length === 0 ? (
                        <p className="text-sm text-gray-500">No redirect URIs configured</p>
                      ) : (
                        client.redirectURLs.map((uri, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <Icon name="arrow_forward" className="text-gray-500 text-sm" />
                            <code className="text-[#1773cf]">{uri}</code>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>OAuth Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-gray-400">Grant Types</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(client.metadata.grantTypes || ["authorization_code"]).map((grant) => (
                      <Badge key={grant} variant="default">{grant}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-gray-400">Token Endpoint Auth Method</Label>
                  <p className="text-base text-white mt-1">
                    {client.metadata.tokenEndpointAuthMethod || "client_secret_basic"}
                  </p>
                </div>
                <div>
                  <Label className="text-gray-400">Client Type</Label>
                  <p className="text-base text-white mt-1">
                    {isConfidential ? "Confidential (has secret)" : "Public (no secret)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Credentials</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-400 block mb-2">Client ID</Label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-[#1a1d24] border border-gray-700 rounded text-sm text-white font-mono break-all">
                    {client.clientId}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => copyToClipboard(client.clientId, "id")}
                  >
                    {copied === "id" ? <Icon name="check" /> : <Icon name="content_copy" />}
                  </Button>
                </div>
              </div>

              {isConfidential && (
                <div>
                  <Label className="text-gray-400 block mb-2">Client Secret</Label>
                  <div className="flex gap-2 mb-2">
                    <code className="flex-1 px-3 py-2 bg-[#1a1d24] border border-gray-700 rounded text-sm text-gray-500 font-mono">
                      ••••••••••••••••
                    </code>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowRotateModal(true)}
                    className="w-full"
                  >
                    <Icon name="refresh" /> Rotate Secret
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    This will invalidate all existing tokens
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-400">Last Used</Label>
                <p className="text-base text-white mt-1">{formatDate(client.lastUsed)}</p>
              </div>
              <div>
                <Label className="text-gray-400">Active Tokens</Label>
                <p className="text-base text-white mt-1">{client.activeTokenCount}</p>
              </div>
              <div>
                <Label className="text-gray-400">Created</Label>
                <p className="text-base text-white mt-1">{formatDateShort(client.createdAt)}</p>
              </div>
              <div>
                <Label className="text-gray-400">Last Modified</Label>
                <p className="text-base text-white mt-1">{formatDateShort(client.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Rotate Secret Modal */}
      {showRotateModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowRotateModal(false)}
          title="Rotate Client Secret"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Icon name="warning" className="text-yellow-500 text-2xl flex-shrink-0" />
              <div className="text-sm text-yellow-200">
                <strong className="block mb-1">This action cannot be undone</strong>
                Rotating the secret will:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Generate a new client secret</li>
                  <li>Invalidate all existing access tokens</li>
                  <li>Require updating the secret in all applications</li>
                </ul>
              </div>
            </div>
            <p className="text-gray-300">
              Are you sure you want to rotate the client secret for <strong>{client.name}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowRotateModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRotateSecret}>
                Rotate Secret
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Secret Modal */}
      {showSecretModal && newSecret && (
        <Modal
          isOpen={true}
          onClose={() => {
            setShowSecretModal(false);
            setNewSecret(null);
            window.location.reload();
          }}
          title="New Client Secret"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Icon name="warning" className="text-yellow-500 text-2xl flex-shrink-0" />
              <div className="text-sm text-yellow-200">
                <strong className="block mb-1">Save this secret now</strong>
                This is the only time you&apos;ll see the new secret. Make sure to copy and store it securely.
              </div>
            </div>
            <div>
              <Label className="text-gray-400 block mb-2">New Client Secret</Label>
              <div className="flex gap-2">
                <code className="flex-1 px-4 py-3 bg-[#1a1d24] border border-gray-700 rounded-lg text-sm text-white font-mono break-all">
                  {newSecret}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(newSecret, "secret")}
                >
                  {copied === "secret" ? (
                    <>
                      <Icon name="check" /> Copied
                    </>
                  ) : (
                    <>
                      <Icon name="content_copy" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setShowSecretModal(false);
                  setNewSecret(null);
                  window.location.reload();
                }}
              >
                I&apos;ve Saved the Secret
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Client Modal */}
      {showDeleteModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowDeleteModal(false)}
          title="Delete OAuth Client"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <Icon name="error" className="text-red-500 text-2xl flex-shrink-0" />
              <div className="text-sm text-red-200">
                <strong className="block mb-1">This action cannot be undone</strong>
                Deleting this client will:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Disable the client permanently</li>
                  <li>Revoke all existing access tokens</li>
                  <li>Prevent new authentications</li>
                </ul>
              </div>
            </div>
            <p className="text-gray-300">
              Are you sure you want to delete <strong>{client.name}</strong>?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete Client
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
