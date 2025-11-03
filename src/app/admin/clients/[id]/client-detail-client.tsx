"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  Button, 
  Icon, 
  Label, 
  Modal, 
  Input, 
  StyledCheckbox, 
  CopyableInput,
} from "@/components/ui";
import { UrlListBuilder } from "@/components/ui/url-list-builder";
import { formatDate, formatDateShort } from "@/lib/utils/date-formatter";
import { toast } from "@/lib/toast";
import { 
  updateClient,
  rotateClientSecret, 
  toggleClientStatus,
  deleteClient,
  type ClientDetail,
  type UpdateClientState,
} from "./actions";

// Available auth methods and grant types
const AUTH_METHODS = ["client_secret_basic", "client_secret_post", "private_key_jwt", "none"] as const;
const GRANT_TYPES = ["authorization_code", "refresh_token", "client_credentials"] as const;
type AuthMethod = typeof AUTH_METHODS[number];

function resolveAuthMethod(client: ClientDetail): AuthMethod {
  const metadata = client.metadata as Record<string, unknown> | undefined;
  const rawCandidate =
    (metadata?.["tokenEndpointAuthMethod"] as string | undefined) ??
    (metadata?.["token_endpoint_auth_method"] as string | undefined);

  if (typeof rawCandidate === "string" && AUTH_METHODS.includes(rawCandidate as AuthMethod)) {
    return rawCandidate as AuthMethod;
  }

  return client.clientSecret ? "client_secret_basic" : "none";
}

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
  const [showDisableModal, setShowDisableModal] = React.useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = React.useState(false);

  // Edit mode state
  const [editName, setEditName] = React.useState(client.name || "");
  const [editRedirectUrls, setEditRedirectUrls] = React.useState<string[]>(client.redirectURLs);
  const [editAuthMethod, setEditAuthMethod] = React.useState<AuthMethod>(resolveAuthMethod(client));
  const [editGrantTypes, setEditGrantTypes] = React.useState<string[]>(client.metadata.grantTypes || ["authorization_code"]);

  const updateWithClientId = updateClient.bind(null, client.clientId);
  const [updateState, updateAction] = useFormState<UpdateClientState, FormData>(
    updateWithClientId,
    { success: false }
  );

  React.useEffect(() => {
    if (updateState.success) {
      const generatedSecret = updateState.data?.newSecret;
      if (generatedSecret) {
        setNewSecret(generatedSecret);
        setShowSecretModal(true);
        toast.success("Client secret generated");
      } else {
        toast.success("Client updated successfully");
      }
      setIsEditing(false);
      router.refresh();
    } else if (updateState.error) {
      toast.error(updateState.error);
    }
  }, [updateState.success, updateState.error, updateState.data, router]);

  const handleRotateSecret = async () => {
    const result = await rotateClientSecret(client.clientId);
    setShowRotateModal(false);
    if (result.success && result.secret) {
      setNewSecret(result.secret);
      setShowSecretModal(true);
      toast.success("Client secret rotated successfully");
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const toggleStatus = React.useCallback(
    async (targetDisabled: boolean) => {
      setIsTogglingStatus(true);
      try {
        const result = await toggleClientStatus(client.clientId, targetDisabled);
        if (result.success) {
          toast.success(
            targetDisabled ? "Client disabled successfully" : "Client enabled successfully"
          );
          router.refresh();
        } else if (result.error) {
          toast.error(result.error);
        }
      } finally {
        setIsTogglingStatus(false);
      }
    },
    [client.clientId, router]
  );

  const handleStatusButtonClick = () => {
    if (client.disabled) {
      void toggleStatus(false);
    } else {
      setShowDisableModal(true);
    }
  };

  const handleDelete = async () => {
    const result = await deleteClient(client.clientId);
    setShowDeleteModal(false);
    if (result.success) {
      toast.success("Client deleted successfully");
      router.push("/admin/clients");
    } else if (result.error) {
      toast.error(result.error);
    }
  };

  const handleSave = () => {
    const formData = new FormData();
    formData.append("name", editName);
    formData.append("redirectURLs", editRedirectUrls.join("\n"));
    formData.append("authMethod", editAuthMethod);
    formData.append("grantTypes", JSON.stringify(editGrantTypes));
    updateAction(formData);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(client.name || "");
    setEditRedirectUrls(client.redirectURLs);
    setEditAuthMethod(resolveAuthMethod(client));
    setEditGrantTypes(client.metadata.grantTypes || ["authorization_code"]);
  };

  const toggleGrantType = (grant: string) => {
    setEditGrantTypes(prev =>
      prev.includes(grant) ? prev.filter(g => g !== grant) : [...prev, grant]
    );
  };

  const isConfidential = client.clientSecret !== null;
  const grantTypes = isEditing ? editGrantTypes : (client.metadata.grantTypes || ["authorization_code"]);
  const authMethod = isEditing ? editAuthMethod : resolveAuthMethod(client);

  return (
    <>
      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        {!isEditing && (
          <Button
            variant={client.disabled ? "primary" : "secondary"}
            size="sm"
            onClick={handleStatusButtonClick}
            disabled={isTogglingStatus}
          >
            {client.disabled ? "Enable Client" : "Disable Client"}
          </Button>
        )}
        <Button
          variant={isEditing ? "primary" : "secondary"}
          size="sm"
          onClick={isEditing ? handleSave : () => setIsEditing(true)}
          disabled={isEditing && (!editName.trim() || editGrantTypes.length === 0)}
        >
          {isEditing ? "Save Changes" : "Edit"}
        </Button>
        {isEditing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancelEdit}
          >
            Cancel
          </Button>
        )}
      </div>

      {/* Single Column Layout */}
      <div className="space-y-6">
        {/* Client Metadata Section */}
        <Card className="border-slate-800" style={{ backgroundColor: '#1A2530' }}>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Client Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing && (
              <div className="mb-6">
                <Label className="text-sm font-medium text-[#93adc8] mb-2 block" htmlFor="clientName">
                  Client Name
                </Label>
                <Input
                  id="clientName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-input border-slate-700 text-white text-sm"
                  placeholder="Enter client name"
                  error={updateState.errors?.name}
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CopyableInput
                id="clientId"
                label="Client ID"
                value={client.clientId}
                labelClassName="text-sm font-medium text-[#93adc8]"
              />
              
              {isConfidential && (
                <CopyableInput
                  id="clientSecret"
                  label="Client Secret"
                  value={client.clientSecret || "********************************"}
                  type="password"
                  labelClassName="text-sm font-medium text-[#93adc8]"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Configuration Section */}
        <Card className="border-slate-800" style={{ backgroundColor: '#1A2530' }}>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium text-[#93adc8]">Authentication Methods</Label>
                <div className="flex flex-col gap-2.5">
                  {AUTH_METHODS.map((method) => (
                    <StyledCheckbox
                      key={method}
                      checked={authMethod === method}
                      onChange={isEditing ? () => setEditAuthMethod(method) : undefined}
                      label={method}
                      readOnly={!isEditing}
                    />
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium text-[#93adc8]">Grant Types</Label>
                <div className="flex flex-col gap-2.5">
                  {GRANT_TYPES.map((grant) => (
                    <StyledCheckbox
                      key={grant}
                      checked={grantTypes.includes(grant)}
                      onChange={isEditing ? () => toggleGrantType(grant) : undefined}
                      label={grant}
                      readOnly={!isEditing}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Redirect URIs Section */}
        <Card className="border-slate-800" style={{ backgroundColor: '#1A2530' }}>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Redirect URIs</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <>
                <UrlListBuilder
                  urls={editRedirectUrls}
                  onChange={setEditRedirectUrls}
                  placeholder="https://example.com/callback"
                  minUrls={1}
                  validateUrl
                />
                {updateState.errors?.redirectURLs && (
                  <p className="text-sm text-red-400 mt-2">{updateState.errors.redirectURLs}</p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-3">
                {client.redirectURLs.length === 0 ? (
                  <p className="text-sm text-gray-400">No redirect URIs configured</p>
                ) : (
                  client.redirectURLs.map((uri, index) => (
                    <Input
                      key={index}
                      value={uri}
                      readOnly
                      className="w-full bg-input border-slate-700 text-white text-sm"
                    />
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Permissions & Scopes Section */}
        <Card className="border-slate-800" style={{ backgroundColor: '#1A2530' }}>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Permissions &amp; Scopes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-700 text-[#93adc8]">
                  <tr>
                    <th className="p-3 font-medium">Scope</th>
                    <th className="p-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="text-white">
                  <tr className="border-b border-slate-800">
                    <td className="p-3 align-top font-mono">openid</td>
                    <td className="p-3 align-top text-[#93adc8]">OpenID Connect authentication scope</td>
                  </tr>
                  <tr className="border-b border-slate-800">
                    <td className="p-3 align-top font-mono">profile</td>
                    <td className="p-3 align-top text-[#93adc8]">Read basic user profile information</td>
                  </tr>
                  <tr>
                    <td className="p-3 align-top font-mono">email</td>
                    <td className="p-3 align-top text-[#93adc8]">Access user email address</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Usage Statistics Section */}
        <Card className="border-slate-800" style={{ backgroundColor: '#1A2530' }}>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Usage Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[#93adc8]">Last Used</Label>
                <p className="text-base text-white mt-1">{formatDate(client.lastUsed)}</p>
              </div>
              <div>
                <Label className="text-[#93adc8]">Active Tokens</Label>
                <p className="text-base text-white mt-1">{client.activeTokenCount}</p>
              </div>
              <div>
                <Label className="text-[#93adc8]">Created</Label>
                <p className="text-base text-white mt-1">{formatDateShort(client.createdAt)}</p>
              </div>
              <div>
                <Label className="text-[#93adc8]">Last Modified</Label>
                <p className="text-base text-white mt-1">{formatDateShort(client.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone Section */}
        <Card className="border-red-500/30" style={{ backgroundColor: 'rgba(153, 27, 27, 0.1)' }}>
          <CardHeader>
            <CardTitle className="text-lg font-bold text-red-400">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {/* Rotate Secret */}
              {isConfidential && (
                <>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h3 className="font-bold text-white">Rotate Secret</h3>
                      <p className="text-sm text-[#93adc8]">
                        Once rotated, the old secret will be immediately invalidated. Update your application with the new secret.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowRotateModal(true)}
                      className="border border-slate-700 hover:border-slate-600 whitespace-nowrap"
                    >
                      Rotate Secret
                    </Button>
                  </div>
                  <div className="border-t border-red-500/20"></div>
                </>
              )}
              
              {/* Delete Client */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="font-bold text-white">Delete Client</h3>
                  <p className="text-sm text-[#93adc8]">
                    This action is permanent and cannot be undone. This will permanently delete the client and all associated data.
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowDeleteModal(true)}
                  className="bg-red-600/80 hover:bg-red-600 whitespace-nowrap"
                >
                  Delete Client
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Disable Client Confirmation */}
      <Modal
        isOpen={showDisableModal}
        onClose={() => {
          if (!isTogglingStatus) {
            setShowDisableModal(false);
          }
        }}
        title="Disable OAuth Client"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <Icon name="warning" className="text-red-500 text-2xl shrink-0" />
            <div className="text-sm text-red-200">
              <strong className="block mb-1">Are you sure you want to disable this client?</strong>
              Disabling the client will immediately block all new OAuth flows. Existing tokens may continue to work until they expire.
            </div>
          </div>
          <p className="text-gray-300 text-sm">
            You can re-enable the client at any time from this page. Consider rotating the secret if you believe it was compromised.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDisableModal(false)}
              disabled={isTogglingStatus}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setShowDisableModal(false);
                void toggleStatus(true);
              }}
              disabled={isTogglingStatus}
            >
              Disable Client
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rotate Secret Modal */}
      <Modal
          isOpen={showRotateModal}
          onClose={() => setShowRotateModal(false)}
          title="Rotate Client Secret"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Icon name="warning" className="text-yellow-500 text-2xl shrink-0" />
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
              <Button variant="secondary" size="sm" onClick={() => setShowRotateModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleRotateSecret}>
                Rotate Secret
              </Button>
            </div>
          </div>
        </Modal>

      {/* New Secret Modal */}
        <Modal
          isOpen={!!(showSecretModal && newSecret)}
          onClose={() => {
            setShowSecretModal(false);
            setNewSecret(null);
            router.refresh();
          }}
          title="New Client Secret"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Icon name="warning" className="text-yellow-500 text-2xl shrink-0" />
              <div className="text-sm text-yellow-200">
                <strong className="block mb-1">Save this secret now</strong>
                This is the only time you&apos;ll see the new secret. Make sure to copy and store it securely.
              </div>
            </div>
            <div>
              <CopyableInput
                id="newSecret"
                label="New Client Secret"
                value={newSecret || ""}
                labelClassName="text-gray-400"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  setShowSecretModal(false);
                  setNewSecret(null);
                  router.refresh();
                }}
              >
                I&apos;ve Saved the Secret
              </Button>
            </div>
          </div>
        </Modal>      {/* Delete Client Modal */}
      <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete OAuth Client"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <Icon name="error" className="text-red-500 text-2xl shrink-0" />
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
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                Delete Client
              </Button>
            </div>
          </div>
        </Modal>
    </>
  );
}
