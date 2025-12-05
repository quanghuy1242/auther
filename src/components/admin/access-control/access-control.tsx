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

export function AccessControl() {
  const client = useClient();
  const clientId = client.id;

  // --- State ---
  const [platformUsers, setPlatformUsers] = React.useState<PlatformUser[]>([]);
  const [permissions, setPermissions] = React.useState<ScopedPermission[]>([]);
  const [apiKeys, setApiKeys] = React.useState<ApiKey[]>([]);
  const [dataModel, setDataModel] = React.useState("{}");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Constraint state
  const [canEditModel, setCanEditModel] = React.useState(false);
  const [canManageAccess, setCanManageAccess] = React.useState(false);

  // C6 Cascade confirmation modal
  const [cascadeModal, setCascadeModal] = React.useState<{
    open: boolean;
    user: PlatformUser | null;
    scopedCount: number;
  }>({ open: false, user: null, scopedCount: 0 });

  // Track the current entity types from the model (for sync)
  const loadedEntityTypesRef = React.useRef<Set<string>>(new Set());

  // --- API Key State ---
  const [allowsApiKeys, setAllowsApiKeys] = React.useState(false);

  // --- Load Data ---
  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load user's access level (C1/C2)
      const accessLevel = await getCurrentUserAccessLevel(clientId);
      setCanEditModel(accessLevel.canEditModel);
      setCanManageAccess(accessLevel.canManageAccess);

      // Load client metadata for API keys
      const metadata = await getClientMetadata(clientId);
      setAllowsApiKeys(metadata.allowsApiKeys);

      // Load platform access list
      const accessList = await getPlatformAccessList(clientId);

      // Map to PlatformUser format
      const users: PlatformUser[] = accessList.map(access => ({
        id: access.id,
        name: access.subjectType === "group" ? `Group ${access.subjectId}` : access.subjectId,
        email: access.subjectType === "group" ? "Group" : access.subjectId,
        role: relationToRole[access.relation] as "Owner" | "Admin" | "User",
        addedOn: access.createdAt.toISOString().split("T")[0],
        isGroup: access.subjectType === "group",
      }));
      setPlatformUsers(users);

      // Load authorization models (all entity types)
      const { models } = await getAuthorizationModels(clientId);

      // Build the wrapped model for DataModelEditor
      const wrappedModel = {
        schema_version: "1.0",
        types: {
          user: {},
          group: { relations: { member: "user" } },
          ...models.types,
        }
      };
      setDataModel(JSON.stringify(wrappedModel, null, 2));
      loadedEntityTypesRef.current = new Set(Object.keys(models.types));

      // Load scoped permissions
      const scopedPerms = await getScopedPermissions(clientId);
      const mappedPerms: ScopedPermission[] = scopedPerms.map(p => ({
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
      setPermissions(mappedPerms);

      // Load API keys
      if (metadata.allowsApiKeys) {
        const keys = await getClientApiKeys(clientId);
        // Map keys to UI format if needed, for now assume API format implies UI format
        // but wait, getClientApiKeys returns `ApiKey` entity from BetterAuth?
        // Let's check getClientApiKeys return type.
        // It returns keys from `auth.api.listApiKeys`.
        // I need to map it to local ApiKey type.
        const mappedKeys: ApiKey[] = keys.map(k => ({
          id: k.id,
          keyId: (k.prefix && k.start) ? `${k.prefix}...${k.start}` : (k.name || k.id.substring(0, 8)),
          owner: k.metadata?.owner as string || "Unknown",
          created: k.createdAt.toISOString().split("T")[0],
          expires: k.expiresAt ? k.expiresAt.toISOString().split("T")[0] : "Never",
          permissions: "Managed via Scoped Permissions",
          status: "Active" // TODO: Add disabled status check if supported
        }));
        setApiKeys(mappedKeys);
      } else {
        setApiKeys([]);
      }

    } catch (err) {
      console.error("Failed to load access control data:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

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
      await loadData();
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
      await loadData();
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
      accessPolicy: "all_users", // Keep default for now or load it
      allowsApiKeys: enabled,
    });

    if (result.success) {
      setAllowsApiKeys(enabled);
      if (enabled) {
        await loadData();
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
          await loadData();
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
      await loadData();
    } catch (e) {
      console.error("Failed to save model:", e);
      setError("Failed to save model: Invalid JSON");
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-3 text-gray-400">
            <Icon name="sync" className="animate-spin" />
            <span>Loading access control...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="error" title="Error loading access control">
            {error}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Access Control</h2>
            <p className="text-sm text-gray-400 mt-1">
              Manage platform access, fine-grained permissions, and API keys.
            </p>
          </div>

          <Tabs
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
                    enabled={allowsApiKeys}
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