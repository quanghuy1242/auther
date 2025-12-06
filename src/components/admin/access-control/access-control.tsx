"use client";

import * as React from "react";
import { Tabs, Card, CardContent, Alert, Icon, Modal, ModalFooter, Button } from "@/components/ui";
import { PlatformAccess } from "./platform-access";
import { ScopedPermissions } from "./scoped-permissions";
import { ApiKeyManagement } from "./api-key-management";
import { DataModelEditor } from "./data-model-editor";
import { AccessControlGuideModal } from "./access-control-guide-modal";
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
  renameEntityType,
  getScopedPermissions,
  grantScopedPermission,
  revokeScopedPermission,
  getCurrentUserAccessLevel,
  checkScopedPermissionsForUser,
  updateClientAccessPolicy,
  getClientMetadata,
  getClientApiKeys,
  type PlatformRelation,
  type ClientAuthorizationModels,
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
  models: Awaited<ReturnType<typeof getAuthorizationModels>>;
  scopedPerms: Awaited<ReturnType<typeof getScopedPermissions>>;
  apiKeys: Awaited<ReturnType<typeof getClientApiKeys>>;
}

interface AccessControlProps {
  initialData?: AccessControlInitialData;
}

// --- Transformation Helpers ---
function transformPlatformUsers(accessList: Awaited<ReturnType<typeof getPlatformAccessList>>): PlatformUser[] {
  return accessList.map(access => ({
    id: access.subjectId,
    tupleId: access.id,
    name: access.subjectName || (access.subjectType === "group" ? `Group ${access.subjectId}` : access.subjectId),
    email: access.subjectEmail || (access.subjectType === "group" ? "Group" : access.subjectId),
    role: relationToRole[access.relation as PlatformRelation] as "Owner" | "Admin" | "User",
    addedOn: access.createdAt.toISOString().split("T")[0],
    isGroup: access.subjectType === "group",
  }));
}

function transformScopedPermissions(scopedPerms: Awaited<ReturnType<typeof getScopedPermissions>>): ScopedPermission[] {
  return scopedPerms.map(p => ({
    id: p.id,
    resourceType: p.entityTypeName,
    resourceId: p.entityId,
    relation: p.relation,
    subject: {
      id: p.subjectId,
      name: p.subjectName || p.subjectId,
      type: (p.subjectType.charAt(0).toUpperCase() + p.subjectType.slice(1)) as "User" | "Group" | "ApiKey",
      description: p.subjectEmail || p.subjectType,
    }
  }));
}

function transformApiKeys(keys: Awaited<ReturnType<typeof getClientApiKeys>>): ApiKey[] {
  return keys.map(k => ({
    id: k.id,
    keyId: (k.prefix && k.start) ? `${k.prefix}...${k.start}` : (k.name || k.id.substring(0, 8)),
    owner: k.name || k.metadata?.owner as string || "Unknown",
    created: k.createdAt.toISOString().split("T")[0],
    expires: k.expiresAt ? k.expiresAt.toISOString().split("T")[0] : "Never",
    permissions: "Managed via Scoped Permissions",
    status: "Active"
  }));
}

function transformAuthorizationModel(models: ClientAuthorizationModels): { dataModel: string; loadedEntityTypes: Set<string> } {
  const wrappedModel = {
    schema_version: "1.0",
    types: models.types
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
    return JSON.stringify({ schema_version: "1.0", types: {} }, null, 2);
  });

  const [isInitialLoading, setIsInitialLoading] = React.useState(!initialData);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);

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

  // Sync state with initialData when it updates (e.g. after router.refresh())
  React.useEffect(() => {
    if (initialData) {
      setPlatformUsers(transformPlatformUsers(initialData.accessList));
      setPermissions(transformScopedPermissions(initialData.scopedPerms));
      setClientMetadata(initialData.metadata);
      setApiKeys(
        initialData.metadata.allowsApiKeys
          ? transformApiKeys(initialData.apiKeys)
          : []
      );
      setDataModel(transformAuthorizationModel(initialData.models.models).dataModel);
      loadedEntityTypesRef.current = transformAuthorizationModel(initialData.models.models).loadedEntityTypes;

      setCanEditModel(initialData.accessLevel.canEditModel);
      setCanManageAccess(initialData.accessLevel.canManageAccess);
    } else {
      loadData();
    }
  }, [initialData, loadData]);

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

    const newRelation = roleToRelation[user.role];
    if (!newRelation) return;

    const subjectType = user.isGroup ? "group" : "user";

    // Ensure only one platform relation per subject by removing other relations first
    const platformRelations: PlatformRelation[] = ["owner", "admin", "use"];
    for (const rel of platformRelations) {
      if (rel === newRelation) continue;
      const revokeResult = await revokePlatformAccess(
        clientId,
        subjectType,
        user.id,
        rel,
        false
      );

      // Ignore not-found errors; log other issues for debugging
      if (!revokeResult.success && revokeResult.error && revokeResult.error !== "Access record not found") {
        console.warn(`Failed to clean up relation ${rel} for ${subjectType}:${user.id}:`, revokeResult.error);
      }
    }

    // Grant / upsert the requested relation
    const result = await grantPlatformAccess(
      clientId,
      subjectType,
      user.id,
      newRelation
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
      // Show confirmation modal with cascade warning
      setCascadeModal({ open: true, user, scopedCount: count });
    } else {
      // Show standard confirmation modal
      setCascadeModal({ open: true, user, scopedCount: 0 });
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

    // If editing existing permissions, revoke the originals before re-creating
    const idsToRevoke = Array.from(
      new Set(
        permData
          .map((p) => p.id)
          .filter((id): id is string => Boolean(id))
      )
    );

    for (const id of idsToRevoke) {
      const revokeResult = await revokeScopedPermission(id);
      if (!revokeResult.success && revokeResult.error && revokeResult.error !== "Permission not found") {
        console.warn(`Failed to revoke existing scoped permission ${id}:`, revokeResult.error);
      }
    }

    for (const pData of permData) {
      if (!pData.subject || !pData.relation || !pData.resourceType || !pData.resourceId) continue;

      const result = await grantScopedPermission(
        clientId,
        pData.resourceType, // entityTypeName
        pData.resourceId === "*" ? "*" : pData.resourceId,
        pData.relation,
        pData.subject.type.toLowerCase() as "user" | "group" | "apikey",
        pData.subject.id,
        pData.condition // Optional Lua script for per-grant ABAC
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

      const newEntityTypes = new Set<string>(Object.keys(parsed.types));
      const oldEntityTypes = new Set<string>(loadedEntityTypesRef.current);

      // Detect renames: types that disappeared and new types that appeared
      const removedTypes = [...oldEntityTypes].filter(t => !newEntityTypes.has(t));
      const addedTypes = [...newEntityTypes].filter(t => !oldEntityTypes.has(t));

      // Try to match renames (when one removed, one added)
      // This is a simple heuristic - if exactly one type was removed and one added,
      // treat it as a rename
      const renameMap = new Map<string, string>(); // oldName -> newName
      if (removedTypes.length === 1 && addedTypes.length === 1) {
        renameMap.set(removedTypes[0], addedTypes[0]);
      }

      // First, process renames to preserve entity type IDs
      for (const [oldName, newName] of renameMap) {
        console.log(`Renaming entity type: ${oldName} -> ${newName}`);
        const result = await renameEntityType(clientId, oldName, newName);
        if (result.success) {
          // Rename succeeded - update our tracking
          removedTypes.splice(removedTypes.indexOf(oldName), 1);
          addedTypes.splice(addedTypes.indexOf(newName), 1);
        } else {
          console.error(`Failed to rename entity type:`, result.error);
          // If rename failed, we'll try create+delete as fallback
        }
      }

      // Now update/create all entity types
      for (const [typeName, typeDef] of Object.entries(parsed.types)) {
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
          await loadData(true);
          return;
        }
      }

      // Delete orphaned types (those not renamed and no longer in the model)
      for (const oldType of loadedEntityTypesRef.current) {
        if (!newEntityTypes.has(oldType)) {
          console.log(`Deleting orphaned entity type: ${oldType}`);
          const result = await deleteEntityTypeModel(clientId, oldType);
          if (!result.success) {
            console.error(`Failed to delete entity type ${oldType}:`, result.error);
            // Show error if deletion failed (likely has scoped permissions)
            setError(`Cannot delete '${oldType}': ${result.error}. Remove scoped permissions first.`);
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
      <AccessControlGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
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
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Access Control</h2>
              <p className="text-sm text-gray-400 mt-1">
                Manage platform access, fine-grained permissions, and API keys.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="w-8 px-0" onClick={() => setIsGuideOpen(true)} title="Documentation & API Guide">
              <Icon name="help" className="text-gray-400 hover:text-white transition-colors" />
            </Button>
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
                    clientId={clientId}
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

      {/* C6 Cascade/Remove Confirmation Modal */}
      <Modal
        isOpen={cascadeModal.open}
        onClose={() => setCascadeModal({ open: false, user: null, scopedCount: 0 })}
        title={cascadeModal.scopedCount > 0 ? "Confirm Access Removal (Cascade)" : "Confirm Access Removal"}
        size="md"
      >
        <div className="space-y-4">
          {cascadeModal.scopedCount > 0 ? (
            <>
              <p className="text-gray-300">
                <strong>{cascadeModal.user?.name}</strong> has <strong>{cascadeModal.scopedCount}</strong> scoped
                permission{cascadeModal.scopedCount !== 1 ? "s" : ""} in this client.
              </p>
              <Alert variant="warning" title="Cascade Warning">
                Removing platform access will also revoke all scoped permissions for this user.
              </Alert>
            </>
          ) : (
            <p className="text-gray-300">
              Are you sure you want to remove access for <strong>{cascadeModal.user?.name}</strong>?
            </p>
          )}
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
            {cascadeModal.scopedCount > 0 ? "Remove & Revoke All" : "Remove User"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}