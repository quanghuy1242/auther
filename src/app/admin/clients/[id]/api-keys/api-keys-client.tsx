"use client";

import * as React from "react";
import Link from "next/link";
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
  Badge,
  CopyableInput,
  Select,
  PermissionTagInput,
  ContentSkeleton,
  ResponsiveTable,
} from "@/components/ui";
import { formatDate } from "@/lib/utils/date-formatter";
import type { ClientDetail } from "../actions";
import type { ClientMetadata } from "../../types";
import {
  createClientApiKey,
  listClientApiKeys,
  revokeApiKey,
  updateApiKeyPermissions,
} from "./actions";
import { getClientMetadata } from "../access/actions";
import { permissionsToTags, tagsToPermissions } from "@/lib/utils/permissions";
import type { ResourcePermissions } from "@/lib/utils/permissions";
import { toast } from "@/lib/toast";

interface ApiKeysClientProps {
  client: ClientDetail;
}

interface ApiKeyListItem {
  id: string;
  name: string;
  enabled: boolean;
  permissions: ResourcePermissions;
  expiresAt: Date | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export function ApiKeysClient({ client }: ApiKeysClientProps) {
  const [loading, setLoading] = React.useState(true);
  const [metadata, setMetadata] = React.useState<ClientMetadata | null>(null);
  const [apiKeys, setApiKeys] = React.useState<ApiKeyListItem[]>([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showKeyModal, setShowKeyModal] = React.useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = React.useState(false);
  const [showRevokeModal, setShowRevokeModal] = React.useState(false);
  const [newApiKey, setNewApiKey] = React.useState<{ key: string; name: string } | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<ApiKeyListItem | null>(null);
  const [keyToRevoke, setKeyToRevoke] = React.useState<{ id: string; name: string } | null>(null);

  // Form states
  const [keyName, setKeyName] = React.useState("");
  const [keyExpiration, setKeyExpiration] = React.useState<string>("never");
  const [customExpirationDays, setCustomExpirationDays] = React.useState("");
  const [selectedApiKeyPermissions, setSelectedApiKeyPermissions] = React.useState<string[]>([]);
  const [editSelectedPermissions, setEditSelectedPermissions] = React.useState<string[]>([]);
  const [defaultPermissions, setDefaultPermissions] = React.useState<string[]>([]);
  const [isSavingDefaults, setIsSavingDefaults] = React.useState(false);

  // Generate available permissions from allowedResources
  const availablePermissionsList = React.useMemo(() => {
    if (!metadata?.allowedResources) return [];
    
    return permissionsToTags(metadata.allowedResources).map(tag => ({
      value: tag,
      label: tag
    }));
  }, [metadata?.allowedResources]);

  // Load data function wrapped in useCallback
  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [metadataResult, keysResult] = await Promise.all([
        getClientMetadata(client.clientId),
        listClientApiKeys(client.clientId),
      ]);

      if (metadataResult) {
        setMetadata(metadataResult);
        
        // Set default permissions from client metadata for form display
        if (metadataResult.defaultApiKeyPermissions) {
          const defaultPerms = permissionsToTags(metadataResult.defaultApiKeyPermissions);
          setDefaultPermissions(defaultPerms);
          setSelectedApiKeyPermissions(defaultPerms);
        } else {
          setDefaultPermissions([]);
        }
      }
      
      setApiKeys(keysResult);
    } catch (err) {
      toast.error("Failed to load data", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [client.clientId]);

  // Load data on mount
  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Convert selected permission tags to ResourcePermissions format
      const permissions = tagsToPermissions(selectedApiKeyPermissions);
      
      // Handle expiration
      let expiresInDays: number | undefined;
      if (keyExpiration === "never") {
        expiresInDays = undefined; // Never expire
      } else if (keyExpiration === "custom") {
        expiresInDays = Number.parseInt(customExpirationDays);
      } else {
        expiresInDays = Number.parseInt(keyExpiration);
      }
      
      const result = await createClientApiKey({
        clientId: client.clientId,
        name: keyName,
        permissions,
        expiresInDays,
      });

      if (result.success && result.apiKey) {
        setNewApiKey({
          key: result.apiKey.key,
          name: result.apiKey.name,
        });
        setShowCreateModal(false);
        setShowKeyModal(true);
        setKeyName("");
        setKeyExpiration("never");
        setCustomExpirationDays("");
        setSelectedApiKeyPermissions([]);
        await loadData();
      } else {
        toast.error("Failed to create API key", result.error);
      }
    } catch (err) {
      toast.error("Failed to create API key", err instanceof Error ? err.message : undefined);
    }
  };

  const handleRevokeKey = async (keyId: string, keyName: string) => {
    setKeyToRevoke({ id: keyId, name: keyName });
    setShowRevokeModal(true);
  };

  const confirmRevokeKey = async () => {
    if (!keyToRevoke) return;

    const result = await revokeApiKey(keyToRevoke.id);

    if (result.success) {
      toast.success("API key revoked", "The API key has been revoked successfully.");
      setShowRevokeModal(false);
      setKeyToRevoke(null);
      await loadData();
    } else {
      toast.error("Failed to revoke API key", result.error);
    }
  };

  const handleUpdatePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKey) return;

    try {
      // Convert selected permission tags to ResourcePermissions format
      const permissions = tagsToPermissions(editSelectedPermissions);
      
      const result = await updateApiKeyPermissions(selectedKey.id, permissions);

      if (result.success) {
        toast.success("Permissions updated", "API key permissions have been updated successfully.");
        setShowPermissionsModal(false);
        setSelectedKey(null);
        setEditSelectedPermissions([]);
        await loadData();
      } else {
        toast.error("Failed to update permissions", result.error);
      }
    } catch (err) {
      toast.error("Failed to update permissions", err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveDefaultPermissions = async () => {
    if (!metadata) return;

    setIsSavingDefaults(true);

    try {
      // Convert permission tags to ResourcePermissions format
      const permissions = tagsToPermissions(defaultPermissions);

      // Import updateClientAccessPolicy from access actions
      const { updateClientAccessPolicy } = await import("../access/actions");
      
      const result = await updateClientAccessPolicy({
        clientId: client.clientId,
        accessPolicy: metadata.accessPolicy,
        allowsApiKeys: metadata.allowsApiKeys,
        defaultApiKeyPermissions: Object.keys(permissions).length > 0 ? permissions : undefined,
      });

      if (result.success) {
        toast.success("Default permissions updated", "Default API key permissions have been saved.");
        await loadData();
      } else {
        toast.error("Failed to update default permissions", result.error);
      }
    } catch (err) {
      toast.error("Failed to save default permissions", err instanceof Error ? err.message : undefined);
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const openPermissionsModal = (key: ApiKeyListItem) => {
    setSelectedKey(key);
    
    // Convert ResourcePermissions to permission tags
    const permTags = permissionsToTags(key.permissions);
    setEditSelectedPermissions(permTags);
    setShowPermissionsModal(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ContentSkeleton lines={3} showTitle />
        <ContentSkeleton lines={5} showTitle />
        <ContentSkeleton lines={4} showTitle />
      </div>
    );
  }

  if (!metadata?.allowsApiKeys) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Icon name="key_off" className="text-6xl text-[#93adc8] mx-auto" />
              <h3 className="text-xl font-bold text-white">API Keys Disabled</h3>
              <p className="text-[#93adc8]">
                This client does not allow API key creation. Enable API keys in the Access Control settings.
              </p>
              <Link href={`/admin/clients/${client.clientId}/access`}>
                <Button size="sm">
                  <Icon name="settings" className="mr-2" />
                  Access Control Settings
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Default API Key Permissions Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Default API Key Permissions</CardTitle>
              <p className="text-sm text-[#93adc8] mt-1">
                Set default permissions that will be applied to new API keys
              </p>
            </div>
            <Badge variant="default">
              {defaultPermissions.length} {defaultPermissions.length === 1 ? "Permission" : "Permissions"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {availablePermissionsList.length === 0 ? (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-yellow-200 text-sm">
                  ⚠️ No resources defined yet. Go to{" "}
                  <Link
                    href={`/admin/clients/${client.clientId}/access`}
                    className="underline hover:text-yellow-100"
                  >
                    Access Control
                  </Link>
                  {" "}to define allowed resources and actions first.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <Label className="mb-2 block">Default Permissions (Optional)</Label>
                  <PermissionTagInput
                    availablePermissions={availablePermissionsList}
                    selectedPermissions={defaultPermissions}
                    onChange={setDefaultPermissions}
                    placeholder="Select default permissions..."
                  />
                  <p className="text-sm text-[#93adc8] mt-2">
                    New API keys will automatically have these permissions. Leave empty for no default permissions.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveDefaultPermissions}
                    disabled={isSavingDefaults}
                  >
                    {isSavingDefaults ? "Saving..." : "Save Defaults"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadData()}
                    disabled={isSavingDefaults}
                  >
                    Reset
                  </Button>

                  {availablePermissionsList.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const allPerms = availablePermissionsList.map((p) => p.value);
                        setDefaultPermissions(allPerms);
                      }}
                      disabled={isSavingDefaults}
                    >
                      Select All
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Keys Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Keys ({apiKeys.length})</CardTitle>
              <p className="text-sm text-[#93adc8] mt-1">
                Create and manage API keys for machine-to-machine access
              </p>
            </div>
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Icon name="add" className="mr-2" />
              Create
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-[#93adc8]">
              No API keys created yet. Create one to enable machine-to-machine access.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-border-dark">
              <ResponsiveTable
                columns={[
                  {
                    key: "name",
                    header: "Name",
                    render: (key) => (
                      <div>
                        <div className="font-medium">{key.name}</div>
                        <div className="text-sm text-[#93adc8] font-mono">
                          {key.id.substring(0, 20)}...
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (key) => (
                      <Badge variant={key.enabled ? "success" : "default"}>
                        {key.enabled ? "Active" : "Disabled"}
                      </Badge>
                    ),
                  },
                  {
                    key: "permissions",
                    header: "Permissions",
                    render: (key) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPermissionsModal(key)}
                      >
                        {Object.keys(key.permissions).length} resources
                      </Button>
                    ),
                  },
                  {
                    key: "expires",
                    header: "Expires",
                    render: (key) => (
                      <span className="text-sm text-[#93adc8]">
                        {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                      </span>
                    ),
                  },
                  {
                    key: "created",
                    header: "Created",
                    render: (key) => (
                      <span className="text-sm text-[#93adc8]">{formatDate(key.createdAt)}</span>
                    ),
                  },
                  {
                    key: "actions",
                    header: "",
                    className: "text-right",
                    render: (key) => (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPermissionsModal(key)}
                        >
                          <Icon name="edit" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeKey(key.id, key.name)}
                        >
                          <Icon name="delete" />
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={apiKeys}
                keyExtractor={(key) => key.id}
                mobileCardRender={(key) => (
                  <div className="rounded-lg p-4 space-y-3 border border-border-dark" style={{ backgroundColor: '#1a2632' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{key.name}</p>
                        <p className="text-xs text-gray-400 font-mono truncate mt-1">
                          {key.id.substring(0, 20)}...
                        </p>
                      </div>
                      <Badge variant={key.enabled ? "success" : "default"} className="shrink-0">
                        {key.enabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="inline-flex">
                        <p className="text-xs text-gray-400 uppercase content-center">Permissions</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPermissionsModal(key)}
                          className="w-full justify-start"
                        >
                          {Object.keys(key.permissions).length} resources
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-400 uppercase mb-1">Expires</p>
                          <p className="text-sm text-[#93adc8]">
                            {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase mb-1">Created</p>
                          <p className="text-sm text-[#93adc8]">{formatDate(key.createdAt)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-border-dark">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openPermissionsModal(key)}
                          className="flex-1"
                        >
                          <Icon name="edit" className="mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRevokeKey(key.id, key.name)}
                          className="flex-1"
                        >
                          <Icon name="delete" className="mr-2" />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                emptyMessage="No API keys created yet."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Allowed Resources Info */}
      {metadata?.allowedResources && (
        <Card>
          <CardHeader>
            <CardTitle>Allowed Resources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(metadata.allowedResources).map(([resource, actions]) => (
                <div key={resource} className="flex items-center gap-2">
                  <span className="font-mono text-white">{resource}:</span>
                  <span className="text-[#93adc8]">{actions.join(", ")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* JWT Exchange Instructions */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Exchange API Key for JWT Token</CardTitle>
          </div>
          <p className="text-sm text-[#93adc8] mt-2">
            Use your API key to obtain a short-lived JWT token (15 minutes) for authenticated requests.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* cURL Example */}
            <div>
              <Label className="mb-2 block">Using cURL</Label>
              <div className="relative">
                <pre className="bg-slate-900 text-[#93adc8] p-4 rounded-lg overflow-x-auto text-sm font-mono">
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://auth.example.com'}/api/auth/api-key/exchange \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "YOUR_API_KEY_HERE"
  }'`}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    const command = `curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://auth.example.com'}/api/auth/api-key/exchange -H "Content-Type: application/json" -d '{"apiKey": "YOUR_API_KEY_HERE"}'`;
                    navigator.clipboard.writeText(command);
                    toast.success("Copied to clipboard!", "Command has been copied.");
                  }}
                >
                  <Icon name="content_copy" />
                </Button>
              </div>
            </div>

            {/* Response Example */}
            <div>
              <Label className="mb-2 block">Expected Response</Label>
              <pre className="bg-slate-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono">
{`{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "expiresAt": "2025-11-02T12:15:00.000Z"
}`}
              </pre>
            </div>

            {/* Using the JWT */}
            <div>
              <Label className="mb-2 block">Using the JWT Token</Label>
              <div className="relative">
                <pre className="bg-slate-900 text-[#93adc8] p-4 rounded-lg overflow-x-auto text-sm font-mono">
{`curl ${typeof window !== 'undefined' ? window.location.origin : 'https://api.example.com'}/api/protected-resource \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"`}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    const command = `curl ${typeof window !== 'undefined' ? window.location.origin : 'https://api.example.com'}/api/protected-resource -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"`;
                    navigator.clipboard.writeText(command);
                    toast.success("Copied to clipboard!", "Command has been copied.");
                  }}
                >
                  <Icon name="content_copy" />
                </Button>
              </div>
            </div>

            {/* Important Notes */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Icon name="info" className="text-blue-400 text-xl shrink-0 mt-0.5" />
                <div className="text-sm text-blue-200 space-y-2">
                  <p><strong>Important:</strong></p>
                  <ul className="list-disc ml-5 space-y-1">
                    <li>JWT tokens expire after <strong>15 minutes</strong></li>
                    <li>Re-exchange your API key to get a new token when it expires</li>
                    <li>Always use <strong>HTTPS</strong> in production</li>
                    <li>Store API keys securely (never commit to source control)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Optional: Permission Scoping */}
            {metadata?.allowedResources && Object.keys(metadata.allowedResources).length > 0 && (
              <div>
                <Label className="mb-2 block">Optional: Request with Permission Scoping</Label>
                <pre className="bg-slate-900 text-[#93adc8] p-4 rounded-lg overflow-x-auto text-sm font-mono">
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://auth.example.com'}/api/auth/api-key/exchange \\
  -H "Content-Type: application/json" \\
  -d '{
    "apiKey": "YOUR_API_KEY_HERE",
    "permissions": ${JSON.stringify(metadata.allowedResources, null, 2).replace(/\n/g, '\n    ')}
  }'`}
                </pre>
                <p className="text-xs text-[#93adc8] mt-2">
                  The request will be rejected if the API key doesn&apos;t have the specified permissions.
                </p>
              </div>
            )}

            {/* Documentation Link */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-700">
              <p className="text-sm text-[#93adc8]">
                Need more details? Check the complete documentation.
              </p>
              <a
                href="https://github.com/quanghuy1242/auther/blob/main/docs/api-key-jwt-exchange.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 text-sm font-medium inline-flex items-center gap-1"
              >
                View Docs
                <Icon name="open_in_new" className="text-sm" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create API Key Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create API Key"
      >
        <form onSubmit={handleCreateKey} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="keyName">Key Name</Label>
            <Input
              id="keyName"
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Production API Key"
              required
            />
          </div>

          <div>
            <Select
              label="Expires In"
              options={[
                { value: "30", label: "30 Days" },
                { value: "90", label: "90 Days" },
                { value: "365", label: "1 Year" },
                { value: "never", label: "Never expire" },
                { value: "custom", label: "Custom..." },
              ]}
              value={keyExpiration}
              onChange={setKeyExpiration}
            />
            
            {/* Show custom days input if "custom" selected */}
            {keyExpiration === "custom" && (
              <Input
                type="number"
                min="1"
                value={customExpirationDays}
                onChange={(e) => setCustomExpirationDays(e.target.value)}
                placeholder="Enter days"
                className="mt-2"
                required
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Permissions</Label>
              {availablePermissionsList.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Select all permissions
                    setSelectedApiKeyPermissions(availablePermissionsList.map(p => p.value));
                  }}
                >
                  Select All
                </Button>
              )}
            </div>
            
            <PermissionTagInput
              availablePermissions={availablePermissionsList}
              selectedPermissions={selectedApiKeyPermissions}
              onChange={setSelectedApiKeyPermissions}
              placeholder="Select permissions for this API key..."
            />
            
            {/* Helper text showing available resources */}
            {metadata?.allowedResources && Object.keys(metadata.allowedResources).length > 0 ? (
              <div className="text-sm text-[#93adc8] mt-2 p-3 bg-slate-800/30 rounded-lg">
                <strong>Available Resources:</strong>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  {Object.entries(metadata.allowedResources).map(([resource, actions]) => (
                    <li key={resource}>
                      <code className="text-primary">{resource}</code>: {actions.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[#93adc8] mt-2">
                No resource constraints defined. Define allowed resources in Access Control settings.
              </p>
            )}
            
            {/* Warning for empty permissions */}
            {selectedApiKeyPermissions.length === 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2">
                <Icon name="warning" className="text-yellow-500 text-lg shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200">
                  This API key will have no permissions. Consider selecting at least one permission for it to be useful.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Create API Key
            </Button>
          </div>
        </form>
      </Modal>

      {/* New API Key Display Modal */}
      <Modal
        isOpen={showKeyModal}
        onClose={() => {
          setShowKeyModal(false);
          setNewApiKey(null);
        }}
        title="API Key Created"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <Icon name="warning" className="text-yellow-500 text-2xl shrink-0" />
            <div className="text-sm text-yellow-200">
              <strong className="block mb-1">Save this key now!</strong>
              This is the only time you&apos;ll see the full API key. Store it securely.
            </div>
          </div>

          {newApiKey && (
            <div>
              <Label>API Key for &quot;{newApiKey.name}&quot;</Label>
              <CopyableInput value={newApiKey.key} />
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              size="sm"
              onClick={() => {
                setShowKeyModal(false);
                setNewApiKey(null);
              }}
            >
              I&apos;ve Saved the Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Update Permissions Modal */}
      <Modal
        isOpen={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
        title="Update Permissions"
      >
        <form onSubmit={handleUpdatePermissions} className="space-y-4">
          <div>
            <Label>API Key</Label>
            <p className="text-white">{selectedKey?.name}</p>
            <p className="text-sm text-[#93adc8] font-mono">{selectedKey?.id}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Permissions</Label>
              {availablePermissionsList.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Select all permissions
                    setEditSelectedPermissions(availablePermissionsList.map(p => p.value));
                  }}
                >
                  Select All
                </Button>
              )}
            </div>
            
            <PermissionTagInput
              availablePermissions={availablePermissionsList}
              selectedPermissions={editSelectedPermissions}
              onChange={setEditSelectedPermissions}
              placeholder="Select permissions for this API key..."
            />
            
            {/* Helper text showing available resources */}
            {metadata?.allowedResources && Object.keys(metadata.allowedResources).length > 0 ? (
              <div className="text-sm text-[#93adc8] mt-2 p-3 bg-slate-800/30 rounded-lg">
                <strong>Available Resources:</strong>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  {Object.entries(metadata.allowedResources).map(([resource, actions]) => (
                    <li key={resource}>
                      <code className="text-primary">{resource}</code>: {actions.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-[#93adc8] mt-2">
                No resource constraints defined. Define allowed resources in Access Control settings.
              </p>
            )}
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowPermissionsModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Update Permissions
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revoke API Key Confirmation Modal */}
      <Modal
        isOpen={showRevokeModal}
        onClose={() => {
          setShowRevokeModal(false);
          setKeyToRevoke(null);
        }}
        title="Revoke API Key"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <Icon name="error" className="text-red-500 text-2xl shrink-0" />
            <div className="text-sm text-red-200">
              <strong className="block mb-1">This action cannot be undone</strong>
              Revoking this API key will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Immediately invalidate the key</li>
                <li>Prevent any further API access using this key</li>
                <li>Cannot be recovered once revoked</li>
              </ul>
            </div>
          </div>
          <p className="text-gray-300">
            Are you sure you want to revoke the API key <strong>&quot;{keyToRevoke?.name}&quot;</strong>?
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowRevokeModal(false);
                setKeyToRevoke(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmRevokeKey}
            >
              Revoke API Key
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
