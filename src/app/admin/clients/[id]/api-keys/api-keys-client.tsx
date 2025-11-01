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
} from "@/components/ui";
import { formatDate } from "@/lib/utils/date-formatter";
import type { ClientDetail } from "../actions";
import {
  createClientApiKey,
  listClientApiKeys,
  revokeApiKey,
  updateApiKeyPermissions,
} from "./actions";
import { getClientMetadata } from "../access/actions";
import type { ResourcePermissions } from "@/lib/utils/permissions";

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

interface ClientMetadata {
  accessPolicy: "all_users" | "restricted";
  allowsApiKeys: boolean;
  allowedResources: Record<string, string[]> | null;
  defaultApiKeyPermissions: Record<string, string[]> | null;
}

export function ApiKeysClient({ client }: ApiKeysClientProps) {
  const [loading, setLoading] = React.useState(true);
  const [metadata, setMetadata] = React.useState<ClientMetadata | null>(null);
  const [apiKeys, setApiKeys] = React.useState<ApiKeyListItem[]>([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showKeyModal, setShowKeyModal] = React.useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = React.useState(false);
  const [newApiKey, setNewApiKey] = React.useState<{ key: string; name: string } | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<ApiKeyListItem | null>(null);

  // Form states
  const [keyName, setKeyName] = React.useState("");
  const [keyExpiration, setKeyExpiration] = React.useState<string>("never");
  const [customExpirationDays, setCustomExpirationDays] = React.useState("");
  const [selectedApiKeyPermissions, setSelectedApiKeyPermissions] = React.useState<string[]>([]);
  const [editSelectedPermissions, setEditSelectedPermissions] = React.useState<string[]>([]);
  const [defaultPermissions, setDefaultPermissions] = React.useState<string[]>([]);
  const [isSavingDefaults, setIsSavingDefaults] = React.useState(false);

  // Error/success states
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Generate available permissions from allowedResources
  const availablePermissionsList = React.useMemo(() => {
    if (!metadata?.allowedResources) return [];
    
    const permissions: Array<{ value: string; label: string }> = [];
    
    for (const [resource, actions] of Object.entries(metadata.allowedResources)) {
      for (const action of actions) {
        const permString = `${resource}:${action}`;
        permissions.push({
          value: permString,
          label: permString
        });
      }
    }
    
    return permissions;
  }, [metadata?.allowedResources]);

  // Load data
  React.useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
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
          const defaultPerms: string[] = [];
          for (const [resource, actions] of Object.entries(metadataResult.defaultApiKeyPermissions)) {
            for (const action of actions) {
              defaultPerms.push(`${resource}:${action}`);
            }
          }
          setDefaultPermissions(defaultPerms);
          setSelectedApiKeyPermissions(defaultPerms);
        } else {
          setDefaultPermissions([]);
        }
      }
      
      setApiKeys(keysResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Convert selected permission tags to ResourcePermissions format
      // From: ["invoices:read", "invoices:write", "payments:read"]
      // To: { "invoices": ["read", "write"], "payments": ["read"] }
      const permissions: ResourcePermissions = {};
      
      for (const permString of selectedApiKeyPermissions) {
        const [resource, action] = permString.split(":");
        if (resource && action) {
          if (!permissions[resource]) {
            permissions[resource] = [];
          }
          permissions[resource].push(action);
        }
      }
      
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
        setError(result.error || "Failed to create API key");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create API key");
    }
  };

  const handleRevokeKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Revoke API key "${keyName}"? This action cannot be undone.`)) return;

    const result = await revokeApiKey(keyId);

    if (result.success) {
      setSuccess("API key revoked successfully");
      await loadData();
    } else {
      setError(result.error || "Failed to revoke API key");
    }
  };

  const handleUpdatePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKey) return;
    setError(null);

    try {
      // Convert selected permission tags to ResourcePermissions format
      const permissions: ResourcePermissions = {};
      
      for (const permString of editSelectedPermissions) {
        const [resource, action] = permString.split(":");
        if (resource && action) {
          if (!permissions[resource]) {
            permissions[resource] = [];
          }
          permissions[resource].push(action);
        }
      }
      
      const result = await updateApiKeyPermissions(selectedKey.id, permissions);

      if (result.success) {
        setSuccess("Permissions updated successfully");
        setShowPermissionsModal(false);
        setSelectedKey(null);
        setEditSelectedPermissions([]);
        await loadData();
      } else {
        setError(result.error || "Failed to update permissions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update permissions");
    }
  };

  const handleSaveDefaultPermissions = async () => {
    if (!metadata) return;

    setIsSavingDefaults(true);
    setError(null);

    try {
      // Convert permission tags to ResourcePermissions format
      const permissions: ResourcePermissions = {};
      
      for (const permString of defaultPermissions) {
        const [resource, action] = permString.split(":");
        if (resource && action) {
          if (!permissions[resource]) {
            permissions[resource] = [];
          }
          permissions[resource].push(action);
        }
      }

      // Import updateClientAccessPolicy from access actions
      const { updateClientAccessPolicy } = await import("../access/actions");
      
      const result = await updateClientAccessPolicy({
        clientId: client.clientId,
        accessPolicy: metadata.accessPolicy,
        allowsApiKeys: metadata.allowsApiKeys,
        defaultApiKeyPermissions: Object.keys(permissions).length > 0 ? permissions : undefined,
      });

      if (result.success) {
        setSuccess("Default API key permissions updated successfully");
        await loadData();
      } else {
        setError(result.error || "Failed to update default permissions");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save default permissions");
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const openPermissionsModal = (key: ApiKeyListItem) => {
    setSelectedKey(key);
    
    // Convert ResourcePermissions to permission tags
    const permTags: string[] = [];
    for (const [resource, actions] of Object.entries(key.permissions)) {
      for (const action of actions) {
        permTags.push(`${resource}:${action}`);
      }
    }
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
      {/* Success/Error Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)}>
            <Icon name="close" />
          </Button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-200 flex items-center justify-between">
          <span>{success}</span>
          <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>
            <Icon name="close" />
          </Button>
        </div>
      )}

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

                  {defaultPermissions.length > 0 && (
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
              Create API Key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-[#93adc8]">
              No API keys created yet. Create one to enable machine-to-machine access.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-700">
                  <tr className="text-left text-[#93adc8]">
                    <th className="pb-3 font-medium">Name</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Permissions</th>
                    <th className="pb-3 font-medium">Expires</th>
                    <th className="pb-3 font-medium">Created</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="text-white">
                      <td className="py-3">
                        <div className="font-medium">{key.name}</div>
                        <div className="text-sm text-[#93adc8] font-mono">
                          {key.id.substring(0, 20)}...
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant={key.enabled ? "success" : "default"}>
                          {key.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPermissionsModal(key)}
                        >
                          {Object.keys(key.permissions).length} resources
                        </Button>
                      </td>
                      <td className="py-3 text-[#93adc8]">
                        {key.expiresAt ? formatDate(key.expiresAt) : "Never"}
                      </td>
                      <td className="py-3 text-[#93adc8]">{formatDate(key.createdAt)}</td>
                      <td className="py-3 text-right">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <CopyableInput value={newApiKey.key} readOnly />
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
    </div>
  );
}
