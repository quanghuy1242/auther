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
}: ApiKeyManagementProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);
  const [managingKey, setManagingKey] = React.useState<ApiKey | null>(null);

  const handleCreateKey = (newKey: Partial<ApiKey>) => {
    // In a real app, this is handled by the backend
    const key: ApiKey = {
      id: Math.random().toString(36).substr(2, 9),
      keyId: newKey.keyId || "",
      owner: newKey.owner || "",
      created: newKey.created || "",
      expires: newKey.expires || "",
      permissions: "",
      status: "Active"
    };
    onChange([key, ...apiKeys]);
    return key;
  };

  const handleUpdateKey = (id: string, updates: Partial<ApiKey>) => {
    onChange(apiKeys.map(k => k.id === id ? { ...k, ...updates } : k));
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
                              onClick={() => handleUpdateKey(key.id, { status: "Revoked" })}
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