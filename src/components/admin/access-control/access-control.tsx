"use client";

import * as React from "react";
import { Tabs, Card, CardContent } from "@/components/ui";
import { PlatformAccess } from "./platform-access";
import { ScopedPermissions } from "./scoped-permissions";
import { ApiKeyManagement } from "./api-key-management";
import { DataModelEditor } from "./data-model-editor";
import type { PlatformUser } from "./add-member-modal";
import type { ScopedPermission, ApiKey } from "./add-permission-modal";

// --- Initial Mock Data ---
const INITIAL_USERS: PlatformUser[] = [
  {
    id: "1",
    name: "Alice Johnson",
    email: "alice@example.com",
    role: "Owner",
    addedOn: "2023-01-15",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alice"
  },
  {
    id: "2",
    name: "Engineering Team",
    email: "24 members",
    role: "Admin",
    addedOn: "2023-02-20",
    isGroup: true,
    memberCount: 24
  },
  {
    id: "3",
    name: "Bob Smith",
    email: "bob@example.com",
    role: "User",
    addedOn: "2024-03-10",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bob"
  }
];

const INITIAL_SCHEMA = `{
  "schema_version": "1.0",
  "types": {
    "user": {},
    "group": {
      "relations": {
        "member": "user"
      }
    },
    "invoice": {
      "relations": {
        "viewer": "user | group#member",
        "payer": "user"
      }
    },
    "report": {
      "relations": {
        "viewer": "user",
        "editor": "user"
      }
    }
  }
}`;

const INITIAL_PERMISSIONS: ScopedPermission[] = [
    {
      id: "1",
      resourceType: "invoice",
      resourceId: "*",
      relation: "viewer",
      subject: {
        id: "1",
        name: "Alice Johnson",
        type: "User",
        description: "alice@example.com"
      }
    }
];

const INITIAL_API_KEYS: ApiKey[] = [
    {
        id: "apikey-1",
        keyId: "key_...a1b2",
        owner: "CI/CD Runner",
        created: "2024-01-15",
        expires: "Never",
        permissions: "",
        status: "Active"
    }
];

export function AccessControl() {
  // --- State ---
  const [platformUsers, setPlatformUsers] = React.useState<PlatformUser[]>(INITIAL_USERS);
  const [permissions, setPermissions] = React.useState<ScopedPermission[]>(INITIAL_PERMISSIONS);
  const [apiKeys, setApiKeys] = React.useState<ApiKey[]>(INITIAL_API_KEYS);
  const [dataModel, setDataModel] = React.useState(INITIAL_SCHEMA);

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

  // --- Handlers ---
  const handleUpdatePlatformUser = (user: PlatformUser) => {
    if (platformUsers.find(u => u.id === user.id)) {
      setPlatformUsers(platformUsers.map(u => u.id === user.id ? user : u));
    } else {
      setPlatformUsers([...platformUsers, user]);
    }
  };

  const handleRemovePlatformUser = (id: string) => {
    setPlatformUsers(platformUsers.filter(u => u.id !== id));
  };

  const handleSavePermission = (permData: Partial<ScopedPermission>[]) => {
    setPermissions(prev => {
       let nextPermissions = [...prev];
       permData.forEach(pData => {
           if (pData.id) {
               nextPermissions = nextPermissions.map(p => p.id === pData.id ? { ...p, ...pData } as ScopedPermission : p);
           } else {
               const id = Math.random().toString(36).substr(2, 9);
               nextPermissions.push({ ...pData, id } as ScopedPermission);
           }
       });
       return nextPermissions;
    });
  };

  const handleRemovePermission = (id: string) => {
    setPermissions(permissions.filter(p => p.id !== id));
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Access Control</h2>
          <p className="text-sm text-gray-400 mt-1">Manage platform access, fine-grained permissions, and API keys.</p>
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
                />
              )
            },
            {
              label: "Data Model",
              icon: "schema",
              content: (
                <DataModelEditor
                  model={dataModel}
                  onChange={setDataModel}
                />
              )
            }
          ]}
        />
      </CardContent>
    </Card>
  );
}