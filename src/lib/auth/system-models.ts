import { AuthorizationModelDefinition } from "@/schemas/rebac";

export interface SystemModelDefinition extends AuthorizationModelDefinition {
    entityType: string;
    description: string;
    isSystem: true;
}

export const SYSTEM_MODELS: SystemModelDefinition[] = [
    {
        entityType: "platform",
        description: "Core platform access levels",
        isSystem: true,
        relations: {
            "super_admin": { union: ["admin"] },
            "admin": { union: ["member"] },
            "member": []
        },
        permissions: {
            "manage_platform": { relation: "admin" }
        }
    },
    {
        entityType: "users",
        description: "User management permissions",
        isSystem: true,
        relations: {
            "admin": { union: ["viewer"] },
            "viewer": []
        },
        permissions: {
            "view": { relation: "viewer" },
            "create": { relation: "admin" },
            "update": { relation: "admin" },
            "delete": { relation: "admin" },
            "ban": { relation: "admin" },
            "impersonate": { relation: "admin" }
        }
    },
    {
        entityType: "groups",
        description: "User group management permissions",
        isSystem: true,
        relations: {
            "admin": { union: ["editor"] },
            "editor": { union: ["viewer"] },
            "viewer": []
        },
        permissions: {
            "view": { relation: "viewer" },
            "create": { relation: "admin" },
            "update": { relation: "editor" },
            "delete": { relation: "admin" },
            "manage_members": { relation: "admin" }
        }
    },
    {
        entityType: "clients",
        description: "OAuth client application management",
        isSystem: true,
        relations: {
            "admin": { union: ["viewer"] },
            "viewer": []
        },
        permissions: {
            "view": { relation: "viewer" },
            "create": { relation: "admin" },
            "update": { relation: "admin" },
            "delete": { relation: "admin" },
            "manage_access": { relation: "admin" }
        }
    },
    {
        entityType: "webhooks",
        description: "Webhook configuration and testing",
        isSystem: true,
        relations: {
            "editor": { union: ["viewer"] },
            "viewer": []
        },
        permissions: {
            "view": { relation: "viewer" },
            "create": { relation: "editor" },
            "update": { relation: "editor" },
            "delete": { relation: "editor" },
            "test": { relation: "editor" }
        }
    },
    {
        entityType: "pipelines",
        description: "Lua pipeline script management",
        isSystem: true,
        relations: {
            "editor": { union: ["viewer"] },
            "viewer": []
        },
        permissions: {
            "view": { relation: "viewer" },
            "create": { relation: "editor" },
            "update": { relation: "editor" },
            "delete": { relation: "editor" },
            "execute": { relation: "viewer" }
        }
    },
    {
        entityType: "api_keys",
        description: "API key management",
        isSystem: true,
        relations: {
            "admin": []
        },
        permissions: {
            "view_all": { relation: "admin" },
            "revoke": { relation: "admin" }
        }
    },
    {
        entityType: "keys",
        description: "System signing key management",
        isSystem: true,
        relations: {
            "admin": []
        },
        permissions: {
            "view": { relation: "admin" },
            "rotate": { relation: "admin" }
        }
    },
    {
        entityType: "sessions",
        description: "User session management",
        isSystem: true,
        relations: {
            "admin": []
        },
        permissions: {
            "view_all": { relation: "admin" },
            "revoke_all": { relation: "admin" }
        }
    }
];
