"use client";

import * as React from "react";
import { Tabs, Card, CardContent, Alert, Icon, Modal, ModalFooter, Button } from "@/components/ui";
import { PlatformAccess } from "./platform-access";
import { ScopedPermissions } from "./scoped-permissions";
import { ApiKeyManagement } from "./api-key-management";
import { DataModelEditor } from "./data-model-editor";
import { useClient } from "@/app/admin/clients/[id]/client-context";
import type { PlatformUser } from "./add-member-modal";
import type { ScopedPermission, ApiKey } from "./add-permission-modal";
import {
  getPlatformAccessList,
  grantPlatformAccess,
  revokePlatformAccess,
  getAuthorizationModels,
  updateEntityTypeModel,
  deleteEntityTypeModel,
  getScopedPermissions,
  grantScopedPermission,
  revokeScopedPermission,
  getCurrentUserAccessLevel,
  checkScopedPermissionsForUser,
  updateClientAccessPolicy,
  getClientMetadata,
  getClientApiKeys,
  type PlatformRelation,
} from "@/app/admin/clients/[id]/access/actions";

// Map from UI role to ReBAC relation
const roleToRelation: Record<string, PlatformRelation> = {
  Owner: "owner",
  Admin: "admin",
  User: "use",
};

const relationToRole: Record<PlatformRelation, string> = {
  owner: "Owner",
  admin: "Admin",
  use: "User",
};

export interface AccessControlInitialData {
  accessLevel: { canEditModel: boolean; canManageAccess: boolean };
  metadata: Awaited<ReturnType<typeof getClientMetadata>>;
  accessList: Awaited<ReturnType<typeof getPlatformAccessList>>;
  models: { models: any }; // Using any to avoid complex type import from repository
  scopedPerms: Awaited<ReturnType<typeof getScopedPermissions>>;
  apiKeys: any[]; // Awaited<ReturnType<typeof getClientApiKeys>>
}

interface AccessControlProps {
  initialData?: AccessControlInitialData;
}

// --- Transformation Helpers ---
function transformPlatformUsers(accessList: any[]): PlatformUser[] {
  return accessList.map(access => ({
    id: access.id,
    name: access.subjectName || (access.subjectType === "group" ? `Group ${access.subjectId}` : access.subjectId),
    email: access.subjectEmail || (access.subjectType === "group" ? "Group" : access.subjectId),
    role: relationToRole[access.relation as PlatformRelation] as "Owner" | "Admin" | "User",
    addedOn: access.createdAt.toISOString().split("T")[0],
    isGroup: access.subjectType === "group",
  }));
}

function transformScopedPermissions(scopedPerms: any[]): ScopedPermission[] {
  return scopedPerms.map(p => ({
    id: p.id,
    resourceType: p.entityId.split(":")[0] || p.entityId,
    resourceId: p.entityId.split(":")[1] || "*",
    relation: p.relation,
    subject: {
      id: p.subjectId,
      name: p.subjectId,
      type: (p.subjectType.charAt(0).toUpperCase() + p.subjectType.slice(1)) as "User" | "Group" | "ApiKey",
      description: p.subjectType,
    }
  }));
}

function transformApiKeys(keys: any[]): ApiKey[] {
  return keys.map(k => ({
    id: k.id,
    keyId: (k.prefix && k.start) ? `${k.prefix}...${k.start}` : (k.name || k.id.substring(0, 8)),
    owner: k.metadata?.owner as string || "Unknown",
    created: k.createdAt.toISOString().split("T")[0],
    expires: k.expiresAt ? k.expiresAt.toISOString().split("T")[0] : "Never",
    permissions: "Managed via Scoped Permissions",
    status: "Active"
  }));
}

function transformAuthorizationModel(models: any): { dataModel: string; loadedEntityTypes: Set<string> } {
  const wrappedModel = {
    schema_version: "1.0",
    types: {
      user: {},
      group: { relations: { member: "user" } },
      ...models.types,
    }
  };
  return {
    dataModel: JSON.stringify(wrappedModel, null, 2),
    loadedEntityTypes: new Set(Object.keys(models.types))
  };
}

export function AccessControl({ initialData }: AccessControlProps) {
  const client = useClient();
  const clientId = client.clientId;

  // --- State Initialization ---
  const [platformUsers, setPlatformUsers] = React.useState<PlatformUser[]>(
    () => initialData ? transformPlatformUsers(initialData.accessList) : []
  );
  const [permissions, setPermissions] = React.useState<ScopedPermission[]>(
    () => initialData ? transformScopedPermissions(initialData.scopedPerms) : []
  );

  // Initialize metadata/API keys state
  const [clientMetadata, setClientMetadata] = React.useState<{
    accessPolicy: "all_users" | "restricted";
    allowsApiKeys: boolean;
    allowedResources: Record<string, string[]> | null;
    defaultApiKeyPermissions: Record<string, string[]> | null;
  } | null>(
    () => initialData ? initialData.metadata : null
  );

  const [apiKeys, setApiKeys] = React.useState<ApiKey[]>(
    () => (initialData && initialData.metadata.allowsApiKeys)
      ? transformApiKeys(initialData.apiKeys)
      : []
  );

  // Initialize Data Model
  const [dataModel, setDataModel] = React.useState(() => {
    if (initialData) {
      return transformAuthorizationModel(initialData.models.models).dataModel;
    }
    return "{}";
  });

  const [isInitialLoading, setIsInitialLoading] = React.useState(!initialData);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  // Constraint state
  const [canEditModel, setCanEditModel] = React.useState(
    () => initialData ? initialData.accessLevel.canEditModel : false
  );
  const [canManageAccess, setCanManageAccess] = React.useState(
    () => initialData ? initialData.accessLevel.canManageAccess : false
  );

  // C6 Cascade confirmation modal
  const [cascadeModal, setCascadeModal] = React.useState<{
    open: boolean;
    user: PlatformUser | null;
    scopedCount: number;
  }>({ open: false, user: null, scopedCount: 0 });

  // Track the current entity types from the model (for sync)
  const loadedEntityTypesRef = React.useRef<Set<string>>(
    initialData
      ? transformAuthorizationModel(initialData.models.models).loadedEntityTypes
      : new Set()
  );

  // --- Load Data ---
  const loadData = React.useCallback(async (refresh = false) => {
    if (refresh) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Load user's access level (C1/C2)
      const accessLevel = await getCurrentUserAccessLevel(clientId);
      setCanEditModel(accessLevel.canEditModel);
      setCanManageAccess(accessLevel.canManageAccess);

      // Load client metadata for API keys
      const metadata = await getClientMetadata(clientId);
      setClientMetadata(metadata);

      // Load platform access list
      const accessList = await getPlatformAccessList(clientId);
      setPlatformUsers(transformPlatformUsers(accessList));

      // Load authorization models (all entity types)
      const { models } = await getAuthorizationModels(clientId);
      const { dataModel, loadedEntityTypes } = transformAuthorizationModel(models);
      setDataModel(dataModel);
      loadedEntityTypesRef.current = loadedEntityTypes;

      // Load scoped permissions
      const scopedPerms = await getScopedPermissions(clientId);
      setPermissions(transformScopedPermissions(scopedPerms));

      // Load API keys
      if (metadata.allowsApiKeys) {
        const keys = await getClientApiKeys(clientId);
        setApiKeys(transformApiKeys(keys));
      } else {
        setApiKeys([]);
      }

    } catch (err) {
      console.error("Failed to load access control data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
      setIsInitialLoading(false);
    }
  }, [clientId]);

  React.useEffect(() => {
    if (!initialData) {
      loadData();
    }
  }, [loadData, initialData]);

  // --- Derived State ---
  const resourceConfig = React.useMemo(() => {
    const config: Record<string, string[]> = {};
    try {
      const parsed = JSON.parse(dataModel);
      if (parsed.types) {
        Object.keys(parsed.types).forEach(type => {
          config[type] = Object.keys(parsed.types[type].relations || {});
        });
      }
    } catch (e) {
      console.error("Invalid JSON Schema", e);
    }
    return config;
  }, [dataModel]);

  // --- Platform Access Handlers ---
  const handleUpdatePlatformUser = async (user: PlatformUser) => {
    if (!canManageAccess) {
      console.error("Permission denied: C2 check failed");
      return;
    }

    const relation = roleToRelation[user.role];
    if (!relation) return;

    const result = await grantPlatformAccess(
      clientId,
      user.isGroup ? "group" : "user",
      user.id,
      relation
    );

    if (result.success) {
      await loadData(true);
    } else {
      console.error("Failed to grant access:", result.error);
    }
  };

  // C6: Check for scoped permissions before removing
  const handleRemovePlatformUser = async (id: string) => {
    if (!canManageAccess) {
      console.error("Permission denied: C2 check failed");
      return;
    }

    const user = platformUsers.find(u => u.id === id);
    if (!user) return;

    // C6: Check if user has scoped permissions
    const { count } = await checkScopedPermissionsForUser(
      clientId,
      user.isGroup ? "group" : "user",
      user.id
    );

    if (count > 0) {
      // Show confirmation modal
      setCascadeModal({ open: true, user, scopedCount: count });
    } else {
      // No scoped permissions, revoke directly
      await executeRevoke(user, false);
    }
  };

  const executeRevoke = async (user: PlatformUser, cascade: boolean) => {
    const relation = roleToRelation[user.role];
    if (!relation) return;

    const result = await revokePlatformAccess(
      clientId,
      user.isGroup ? "group" : "user",
      user.id,
      relation,
      cascade
    );

    if (result.success) {
      await loadData(true);
    } else {
      console.error("Failed to revoke access:", result.error);
    }

    setCascadeModal({ open: false, user: null, scopedCount: 0 });
  };

  // --- API Key Handler ---
  const handleToggleApiKeys = async (enabled: boolean) => {
    if (!canManageAccess) {
      console.error("Permission denied: C2 check failed");
      return;
    }

    const result = await updateClientAccessPolicy({
      clientId,
      accessPolicy: clientMetadata?.accessPolicy || "all_users",
      allowsApiKeys: enabled,
      allowedResources: clientMetadata?.allowedResources || undefined,
      defaultApiKeyPermissions: clientMetadata?.defaultApiKeyPermissions || undefined,
    });

    if (result.success) {
      setClientMetadata(prev => prev ? { ...prev, allowsApiKeys: enabled } : null);
      if (enabled) {
        await loadData(true);
      } else {
        setApiKeys([]);
      }
    } else {
      console.error("Failed to toggle API keys:", result.error);
      setError(`Failed to toggle API keys: ${result.error}`);
    }
  };

  // --- Scoped Permission Handlers ---
  const handleSavePermission = async (permData: Partial<ScopedPermission>[]) => {
    if (!canManageAccess) {
      console.error("Permission denied: C2 check failed");
      return;
    }

    for (const pData of permData) {
      if (!pData.subject || !pData.relation || !pData.resourceType || !pData.resourceId) continue;

      const result = await grantScopedPermission(
        clientId,
        pData.resourceType, // entityTypeName
        pData.resourceId === "*" ? "*" : pData.resourceId,
        pData.relation,
        pData.subject.type.toLowerCase() as "user" | "group" | "apikey",
        pData.subject.id
      );

      if (!result.success) {
        console.error("Failed to grant permission:", result.error);
      }
    }
    await loadData();
  };

  const handleRemovePermission = async (id: string) => {
    // C5 warning is handled in the UI component (shows warning before calling this)
    const result = await revokeScopedPermission(id);
    if (result.success) {
      if (result.warnings && result.warnings.length > 0) {
        setError(`Warning: ${result.warnings.join("; ")}`);
      }
      await loadData();
    } else {
      console.error("Failed to revoke permission:", result.error);
      setError(`Failed to revoke permission: ${result.error}`);
    }
  };

  // --- Data Model Handler ---
  // --- Data Model Handler ---
  // Just update local state
  const handleLocalModelChange = (newModel: string) => {
    setDataModel(newModel);
  };

  // Persist to server
  const handleSaveModel = async () => {
    if (!canEditModel) {
      console.error("Permission denied: C1 check failed");
      return;
    }

    setIsLoading(true); // Show loading during save
    try {
      const parsed = JSON.parse(dataModel);
      if (!parsed.types) {
        setIsLoading(false);
        return;
      }

      const newEntityTypes = new Set<string>();
      const baseTypes = new Set(["user", "group"]);

      for (const [typeName, typeDef] of Object.entries(parsed.types)) {
        if (baseTypes.has(typeName)) continue;

        newEntityTypes.add(typeName);

        const def = typeDef as {
          relations?: Record<string, string>;
          permissions?: Record<string, { relation: string }>
        };

        const result = await updateEntityTypeModel(
          clientId,
          typeName,
          def.relations || {},
          def.permissions || {}
        );

        if (!result.success) {
          console.error(`Failed to update entity type ${typeName}:`, result.error);
          setError(`Failed to update entity type ${typeName}: ${result.error}`);
          setError(`Failed to update entity type ${typeName}: ${result.error}`);
          await loadData(true);
          return;
        }
      }

      for (const oldType of loadedEntityTypesRef.current) {
        if (!newEntityTypes.has(oldType)) {
          console.log(`Deleting orphaned entity type: ${oldType}`);
          const result = await deleteEntityTypeModel(clientId, oldType);
          if (!result.success) {
            console.error(`Failed to delete entity type ${oldType}:`, result.error);
          }
        }
      }

      loadedEntityTypesRef.current = newEntityTypes;
      // AccessControl doesn't show success toast, but we can reload to confirm sync
      await loadData(true);
    } catch (e) {
      console.error("Failed to save model:", e);
      setError("Failed to save model: Invalid JSON");
      setIsLoading(false); // Only set local/sync loading false
    }
  };

  if (isInitialLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-3 text-gray-400">
            <Icon name="progress_activity" className="animate-spin text-2xl" />
            <span>Loading access control...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-6 relative">
          {isLoading && (
            <div className="absolute inset-0 z-50 bg-background/50 flex items-center justify-center rounded-lg backdrop-blur-sm transition-opacity duration-200">
              <div className="flex items-center gap-3 px-4 py-2 bg-popover rounded-full shadow-lg border border-border">
                <Icon name="progress_activity" className="animate-spin text-primary" />
                <span className="text-sm font-medium">Syncing...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6">
              <Alert variant="error" title="Error">
                {error}
              </Alert>
            </div>
          )}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Access Control</h2>
            <p className="text-sm text-gray-400 mt-1">
              Manage platform access, fine-grained permissions, and API keys.
            </p>
          </div>

          <Tabs
            selectedIndex={activeTab}
            onChange={setActiveTab}
            tabs={[
              {
                label: "Platform Access",
                icon: "admin_panel_settings",
                content: (
                  <PlatformAccess
                    users={platformUsers}
                    onUpdate={handleUpdatePlatformUser}
                    onRemove={handleRemovePlatformUser}
                    disabled={!canManageAccess}
                  />
                )
              },
              {
                label: "Scoped Permissions",
                icon: "lock_person",
                content: (
                  <ScopedPermissions
                    permissions={permissions}
                    onSave={handleSavePermission}
                    onRemove={handleRemovePermission}
                    resourceConfig={resourceConfig}
                    apiKeys={apiKeys}
                    disabled={!canManageAccess}
                  />
                )
              },
              {
                label: "API Keys",
                icon: "vpn_key",
                content: (
                  <ApiKeyManagement
                    apiKeys={apiKeys}
                    onChange={setApiKeys}
                    permissions={permissions}
                    onSavePermission={handleSavePermission}
                    onRemovePermission={handleRemovePermission}
                    resourceConfig={resourceConfig}
                    enabled={clientMetadata?.allowsApiKeys ?? false}
                    onToggle={handleToggleApiKeys}
                    disabled={!canManageAccess}
                  />
                )
              },
              {
                label: "Data Model",
                icon: "schema",
                content: (
                  <DataModelEditor
                    model={dataModel}
                    onChange={handleLocalModelChange}
                    onSave={handleSaveModel}
                    disabled={!canEditModel}
                  />
                )
              }
            ]}
          />
        </CardContent>
      </Card>

      {/* C6 Cascade Confirmation Modal */}
      <Modal
        isOpen={cascadeModal.open}
        onClose={() => setCascadeModal({ open: false, user: null, scopedCount: 0 })}
        title="Confirm Access Removal"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-gray-300">
            <strong>{cascadeModal.user?.name}</strong> has <strong>{cascadeModal.scopedCount}</strong> scoped
            permission{cascadeModal.scopedCount !== 1 ? "s" : ""} in this client.
          </p>
          <Alert variant="warning" title="Cascade Warning">
            Removing platform access will also revoke all scoped permissions for this user.
          </Alert>
        </div>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => setCascadeModal({ open: false, user: null, scopedCount: 0 })}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => cascadeModal.user && executeRevoke(cascadeModal.user, true)}
          >
            Remove & Revoke All
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}