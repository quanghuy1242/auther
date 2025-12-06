"use client";

import * as React from "react";
import {
  Button,
  Switch,
  EmptyState,
  Modal,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Badge,
  Icon,
  Alert
} from "@/components/ui";
import { SectionHeader } from "@/components/ui/section-header";
import { CreateApiKeyModal, type ApiKey } from "./create-api-key-modal";
import { ScopedPermissions } from "./scoped-permissions";
import { type ScopedPermission } from "./add-permission-modal";
import { createClientApiKey, revokeClientApiKey, getClientApiKeys, type ApiKeyResult } from "@/app/admin/clients/[id]/access/actions";
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";

export interface ApiKeyManagementProps {
  apiKeys: ApiKey[];
  onChange: (keys: ApiKey[]) => void;
  permissions: ScopedPermission[];
  onSavePermission: (perms: Partial<ScopedPermission>[]) => void;
  onRemovePermission: (id: string) => void;
  resourceConfig: Record<string, string[]>;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

export function ApiKeyManagement({
  apiKeys,
  onChange,
  permissions,
  onSavePermission,
  onRemovePermission,
  resourceConfig,
  enabled,
  onToggle,
  disabled = false,
  clientId,
}: ApiKeyManagementProps & { clientId: string }) {
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [managingKey, setManagingKey] = React.useState<ApiKey | null>(null);

  // Confirmation state
  const [revokeKeyId, setRevokeKeyId] = React.useState<string | null>(null);
  const [isRevoking, setIsRevoking] = React.useState(false);

  // Helper to refresh keys without full page reload
  const refreshKeys = async () => {
    try {
      const keys = await getClientApiKeys(clientId);
      const transformedKeys: ApiKey[] = keys.map(k => ({
        id: k.id,
        keyId: (k.prefix && k.start) ? `${k.prefix}...${k.start}` : (k.name || k.id.substring(0, 8)),
        owner: k.name || k.metadata?.owner as string || "Unknown",
        created: k.createdAt.toISOString().split("T")[0],
        expires: k.expiresAt ? k.expiresAt.toISOString().split("T")[0] : "Never",
        permissions: "Managed via Scoped Permissions",
        status: "Active"
      }));
      onChange(transformedKeys);
    } catch (error) {
      console.error("Failed to refresh keys:", error);
    }
  };

  const handleCreateKey = async (newKey: { name: string; expiresInDays?: number; permissions?: Record<string, string[]> }): Promise<ApiKeyResult> => {
    // Call server action
    const result = await createClientApiKey({
      clientId,
      name: newKey.name,
      expiresInDays: newKey.expiresInDays,
      permissions: newKey.permissions || {},
    });

    if (result.success) {
      toast.success("API Key created successfully");
      await refreshKeys();
    } else {
      toast.error(result.error || "Failed to create API key");
    }

    return result;
  };

  const handleRevokeKey = async (id: string) => {
    setIsRevoking(true);
    try {
      const result = await revokeClientApiKey(id);

      if (result.success) {
        toast.success("API Key revoked");
        await refreshKeys();
        setRevokeKeyId(null);
      } else {
        toast.error(result.error || "Failed to revoke API key");
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const confirmRevoke = (id: string) => {
    setRevokeKeyId(id);
  };

  const getPermissionCount = (key: ApiKey) => {
    return permissions.filter(p => p.subject.id === key.id).length;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Switch
          checked={enabled}
          onChange={onToggle}
          label="Enable API Keys"
          description="Allow API keys to authenticate against this client."
          disabled={disabled}
        />
      </div>

      {disabled && <Alert variant="info" title="View Only">You need Admin or Owner role to manage API keys.</Alert>}

      {enabled && (
        <div className="space-y-4">
          <SectionHeader
            title="Issued Keys"
            description="Manage lifecycle and access for service accounts."
            action={
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                leftIcon="add"
                disabled={disabled}
              >
                Generate Key
              </Button>
            }
          />

          {apiKeys.length === 0 ? (
            <EmptyState
              icon="vpn_key"
              title="No API Keys"
              description="Generate an API key to allow external services to access your application."
              action={
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  variant="secondary"
                  disabled={disabled}
                >
                  Generate Key
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border border-[#243647] overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key ID</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map(key => {
                    const permCount = getPermissionCount(key);
                    return (
                      <TableRow key={key.id}>
                        <TableCell className="font-mono text-xs text-gray-400">{key.keyId}</TableCell>
                        <TableCell className="text-white font-medium">{key.owner}</TableCell>
                        <TableCell>{key.created}</TableCell>
                        <TableCell>{key.expires}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => setManagingKey(key)}
                            disabled={disabled}
                            className="flex items-center gap-2 px-2 py-1 rounded bg-[#243647] hover:bg-slate-700 transition-colors text-xs text-blue-300 border border-transparent hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Icon name="lock_person" size="sm" className="text-blue-400" />
                            {permCount === 0 ? "No Access" : `${permCount} Permission${permCount > 1 ? "s" : ""}`}
                          </button>
                        </TableCell>
                        <TableCell>
                          {key.status === "Active" ? (
                            <Badge variant="success" dot>Active</Badge>
                          ) : (
                            <Badge variant="default" dot>Revoked</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {key.status === "Active" ? (
                            <button
                              onClick={() => confirmRevoke(key.id)}
                              disabled={disabled}
                              className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <CreateApiKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleCreateKey}
        onAssignPermissions={(key) => setManagingKey(key)}
        clientId={clientId}
      />

      {/* Confirmation Modal for Revoke */}
      <ConfirmationModal
        isOpen={!!revokeKeyId}
        onClose={() => setRevokeKeyId(null)}
        onConfirm={() => revokeKeyId && handleRevokeKey(revokeKeyId)}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? Applications using this key will immediately lose access."
        confirmText="Revoke Key"
        loading={isRevoking}
      />

      {/* Manage Access Modal (Replaces Drawer) */}
      {managingKey && (
        <Modal
          isOpen={!!managingKey}
          onClose={() => setManagingKey(null)}
          title="Manage Access"
          size="xl"
        >
          <div className="space-y-6">
            <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-700 bg-[#111921]">
              <Icon name="key" size="sm" className="text-amber-500" />
              <span className="text-white font-medium">{managingKey.owner}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-gray-400">
                {managingKey.keyId}
              </span>
            </div>

            <div>
              <p className="text-sm text-gray-400 mb-4">
                Configure fine-grained permissions for this API key. These permissions are also visible in the main Access Control tab.
              </p>

              <ScopedPermissions
                permissions={permissions}
                onSave={onSavePermission}
                onRemove={onRemovePermission}
                resourceConfig={resourceConfig}
                apiKeys={apiKeys}
                subjectFilter={{
                  id: managingKey.id,
                  name: managingKey.owner,
                  type: "ApiKey"
                }}
              />
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setManagingKey(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}