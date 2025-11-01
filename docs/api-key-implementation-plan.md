# API Key & Access Control Implementation Plan

## Current State Analysis

### Existing Utilities Structure (`src/lib/utils/`)

#### Authentication & Security
- **auth-middleware.ts**: Signup path validation, restricted access control
- **auth-validation.ts**: Authorization header validation, Bearer token & secret header validation
- **encryption.ts**: AES-256-GCM encryption/decryption, webhook secret generation, ID generation utilities

#### HTTP & Validation
- **http.ts**: Bearer token extraction, Basic Auth header creation, content type checking
- **validation.ts**: Timestamp validation, required field validation

#### Data Processing
- **date-formatter.ts**: Time formatting (relative, absolute, duration)
- **time.ts**: Alternative time utilities
- **user-agent.ts**: Browser/device parsing

#### URL & Pattern Matching
- **url.ts**: Origin extraction, relative path resolution
- **wildcard.ts**: Wildcard pattern to regex conversion, pattern partitioning
- **cors.ts**: CORS configuration, origin matching, preflight handling

#### OAuth & Client Management
- **oauth-client.ts**: OAuth client config management, preview redirect handling

#### UI Utilities
- **clipboard.ts**: Copy to clipboard with React hooks
- **cn.ts**: Tailwind class merging

### Existing Database Schema

#### Auth Tables (Better Auth)
- `user`: User accounts with email, role, ban status
- `session`: User sessions with IP, user agent tracking
- `account`: OAuth provider accounts (social login)
- `verification`: Email verification codes
- `jwks`: JSON Web Key Set for token signing
- `oauthApplication`: OAuth2 clients with metadata
- `oauthAccessToken`: OAuth2 access/refresh tokens
- `oauthConsent`: User consent records

#### App Tables
- `webhook_endpoint`: Webhook destinations with encrypted secrets
- `webhook_subscription`: Event type subscriptions per endpoint
- `webhook_event`: Event log with payload
- `webhook_delivery`: Delivery attempts with status tracking

### Existing Repository Pattern
- **base-repository.ts**: Interface with CRUD operations and pagination
- **oauth-client-repository.ts**: Client management with stats, filtering, metadata parsing
- Other repositories: account, session, user, jwks, webhook

---

## Required Implementation

### 1. Database Schema Changes

#### New Tables

##### `user_client_access` - User/Group Access Control
```sql
CREATE TABLE user_client_access (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  access_level    TEXT NOT NULL,  -- 'use', 'admin'
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at      INTEGER,        -- timestamp for temporary access
  
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_application(id) ON DELETE CASCADE,
  UNIQUE(user_id, client_id)
);

CREATE INDEX user_client_access_user_id_idx ON user_client_access(user_id);
CREATE INDEX user_client_access_client_id_idx ON user_client_access(client_id);
```

##### `user_group` - Optional Group Management
```sql
CREATE TABLE user_group (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  
  UNIQUE(name)
);
```

##### `group_membership` - User-Group Association
```sql
CREATE TABLE group_membership (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  group_id        TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES user_group(id) ON DELETE CASCADE,
  UNIQUE(user_id, group_id)
);
```

##### `group_client_access` - Group Access Control
```sql
CREATE TABLE group_client_access (
  id              TEXT PRIMARY KEY,
  group_id        TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  access_level    TEXT NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  
  FOREIGN KEY (group_id) REFERENCES user_group(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES oauth_application(id) ON DELETE CASCADE,
  UNIQUE(group_id, client_id)
);
```

##### `api_key` - Better Auth API Key Plugin Table
```sql
-- This table is provided by Better Auth's API Key plugin
-- We'll extend the metadata field to include our custom fields
CREATE TABLE api_key (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  prefix                  TEXT NOT NULL,
  key_hash                TEXT NOT NULL,
  enabled                 INTEGER NOT NULL DEFAULT 1,
  expires_at              INTEGER,
  remaining               INTEGER,
  refill_interval         INTEGER,
  rate_limit_time_window  INTEGER,
  rate_limit_max          INTEGER,
  metadata                TEXT,  -- JSON: { oauth_client_id, name, description }
  permissions             TEXT,  -- JSON: { "projects": ["read", "write"] }
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
```

#### Schema Extensions to Existing Tables

##### `oauth_application` - Add API Key Support Fields
```sql
-- Add columns to oauth_application table via migration:
ALTER TABLE oauth_application ADD COLUMN allowed_resources TEXT; -- JSON
ALTER TABLE oauth_application ADD COLUMN allows_api_keys INTEGER DEFAULT 0;
ALTER TABLE oauth_application ADD COLUMN default_api_key_permissions TEXT; -- JSON
ALTER TABLE oauth_application ADD COLUMN access_policy TEXT DEFAULT 'all_users'; -- 'all_users' | 'restricted'
```

**Schema Definition Update:**
```typescript
export const oauthApplication = sqliteTable("oauth_application", {
  // ... existing fields
  allowedResources: text("allowed_resources"), // JSON: { "projects": ["read","write"] }
  allowsApiKeys: integer("allows_api_keys", { mode: "boolean" }).default(false),
  defaultApiKeyPermissions: text("default_api_key_permissions"), // JSON
  accessPolicy: text("access_policy").default("all_users"), // 'all_users' | 'restricted'
});
```

---

### 2. New Utility Functions

#### `src/lib/utils/api-key.ts` - API Key Utilities
```typescript
/**
 * API Key generation and validation utilities
 */

import { randomBytes } from "crypto";

/**
 * Generate a new API key with prefix
 * Format: sk_live_{base64url_random}
 */
export function generateApiKey(prefix: string = "sk_live"): { 
  key: string; 
  hash: string; 
  prefix: string;
} {
  const bytes = randomBytes(32);
  const key = `${prefix}_${bytes.toString("base64url")}`;
  const hash = hashApiKey(key);
  return { key, hash, prefix };
}

/**
 * Hash an API key for storage (SHA-256)
 */
export function hashApiKey(key: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Extract prefix from API key
 */
export function extractApiKeyPrefix(key: string): string | null {
  const match = key.match(/^([^_]+_[^_]+)_/);
  return match ? match[1] : null;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^sk_(live|test)_[A-Za-z0-9_-]{43}$/.test(key);
}
```

#### `src/lib/utils/permissions.ts` - Permission Utilities
```typescript
/**
 * Permission and resource access utilities
 */

export type ResourcePermissions = Record<string, string[]>;

/**
 * Check if permissions are valid
 */
export function validatePermissions(
  permissions: ResourcePermissions,
  allowedResources: ResourcePermissions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const [resource, actions] of Object.entries(permissions)) {
    if (!allowedResources[resource]) {
      errors.push(`Resource "${resource}" is not allowed`);
      continue;
    }
    
    for (const action of actions) {
      if (!allowedResources[resource].includes(action)) {
        errors.push(`Action "${action}" not allowed for resource "${resource}"`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Merge default permissions with custom permissions
 */
export function mergePermissions(
  defaults: ResourcePermissions,
  custom: ResourcePermissions
): ResourcePermissions {
  const merged = { ...defaults };
  
  for (const [resource, actions] of Object.entries(custom)) {
    merged[resource] = [...new Set([...(merged[resource] || []), ...actions])];
  }
  
  return merged;
}

/**
 * Check if user has required permissions
 */
export function hasPermission(
  userPermissions: ResourcePermissions,
  requiredResource: string,
  requiredAction: string
): boolean {
  const actions = userPermissions[requiredResource];
  return actions?.includes(requiredAction) ?? false;
}
```

#### `src/lib/utils/access-control.ts` - Access Control Utilities
```typescript
/**
 * User-to-client access control utilities
 */

export type AccessLevel = "use" | "admin";

/**
 * Check if access level allows action
 */
export function canPerformAction(
  accessLevel: AccessLevel,
  requiredLevel: AccessLevel
): boolean {
  if (accessLevel === "admin") return true;
  return accessLevel === requiredLevel;
}

/**
 * Parse access level from string
 */
export function parseAccessLevel(level: string): AccessLevel | null {
  if (level === "use" || level === "admin") return level;
  return null;
}

/**
 * Get all access levels
 */
export function getAllAccessLevels(): AccessLevel[] {
  return ["use", "admin"];
}
```

---

### 3. New Repositories

#### `src/lib/repositories/user-client-access-repository.ts`
```typescript
import { db } from "@/lib/db";
import { userClientAccess } from "@/db/app-schema";
import { eq, and } from "drizzle-orm";

export interface UserClientAccessEntity {
  id: string;
  userId: string;
  clientId: string;
  accessLevel: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export class UserClientAccessRepository {
  async findByUserAndClient(
    userId: string, 
    clientId: string
  ): Promise<UserClientAccessEntity | null>;
  
  async findByClient(clientId: string): Promise<UserClientAccessEntity[]>;
  
  async create(data: {
    userId: string;
    clientId: string;
    accessLevel: string;
    expiresAt?: Date;
  }): Promise<UserClientAccessEntity>;
  
  async update(
    id: string, 
    data: Partial<UserClientAccessEntity>
  ): Promise<UserClientAccessEntity | null>;
  
  async delete(id: string): Promise<boolean>;
  
  async checkAccess(
    userId: string, 
    clientId: string
  ): Promise<{ hasAccess: boolean; level: string | null }>;
}
```

#### `src/lib/repositories/api-key-repository.ts`
```typescript
import { db } from "@/lib/db";
import { apiKey } from "@/db/app-schema";

export interface ApiKeyEntity {
  id: string;
  userId: string;
  prefix: string;
  keyHash: string;
  enabled: boolean;
  expiresAt: Date | null;
  metadata: {
    oauth_client_id?: string;
    name?: string;
    description?: string;
  } | null;
  permissions: Record<string, string[]> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ApiKeyRepository {
  async findByHash(keyHash: string): Promise<ApiKeyEntity | null>;
  
  async findByClient(clientId: string): Promise<ApiKeyEntity[]>;
  
  async create(data: {
    userId: string;
    keyHash: string;
    prefix: string;
    metadata?: object;
    permissions?: object;
    expiresAt?: Date;
  }): Promise<ApiKeyEntity>;
  
  async revoke(id: string): Promise<boolean>;
  
  async verifyKey(keyHash: string): Promise<{
    valid: boolean;
    key?: ApiKeyEntity;
  }>;
}
```

#### `src/lib/repositories/user-group-repository.ts`
```typescript
export interface UserGroupEntity {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserGroupRepository {
  async findById(id: string): Promise<UserGroupEntity | null>;
  async findByName(name: string): Promise<UserGroupEntity | null>;
  async findAll(): Promise<UserGroupEntity[]>;
  async create(data: { name: string; description?: string }): Promise<UserGroupEntity>;
  async update(id: string, data: Partial<UserGroupEntity>): Promise<UserGroupEntity | null>;
  async delete(id: string): Promise<boolean>;
  
  // Membership methods
  async addMember(groupId: string, userId: string): Promise<void>;
  async removeMember(groupId: string, userId: string): Promise<void>;
  async getMembers(groupId: string): Promise<string[]>;
  async getUserGroups(userId: string): Promise<UserGroupEntity[]>;
}
```

---

### 4. Backend Actions & Middleware

#### `src/app/admin/clients/[id]/api-keys/actions.ts`
```typescript
"use server";

import { auth } from "@/lib/auth";
import { ApiKeyRepository } from "@/lib/repositories/api-key-repository";
import { generateApiKey } from "@/lib/utils/api-key";
import { validatePermissions } from "@/lib/utils/permissions";

export async function createApiKey(
  clientId: string,
  data: {
    name: string;
    description?: string;
    permissions: Record<string, string[]>;
    expiresInDays?: number;
  }
) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  
  // Validate permissions against client's allowedResources
  // Generate key
  // Store in database
  // Return key (only shown once)
}

export async function revokeApiKey(keyId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  
  // Revoke key
  // Return success
}

export async function listApiKeys(clientId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  
  // List keys for client
  // Return array of keys (without actual key value)
}
```

#### `src/app/admin/clients/[id]/access-control/actions.ts`
```typescript
"use server";

export async function updateAccessPolicy(
  clientId: string,
  policy: "all_users" | "restricted"
) {
  // Update client's access_policy field
}

export async function assignUserToClient(
  clientId: string,
  userId: string,
  accessLevel: "use" | "admin"
) {
  // Add user_client_access record
}

export async function removeUserFromClient(
  clientId: string,
  userId: string
) {
  // Delete user_client_access record
}

export async function listClientUsers(clientId: string) {
  // Get all users assigned to client
}

export async function assignGroupToClient(
  clientId: string,
  groupId: string,
  accessLevel: "use" | "admin"
) {
  // Add group_client_access record
}
```

#### `src/app/api/oauth2/authorize/route.ts` - Middleware Enhancement
```typescript
import { UserClientAccessRepository } from "@/lib/repositories/user-client-access-repository";

// In the /oauth2/authorize handler:
async function checkUserClientAccess(userId: string, clientId: string) {
  const client = await oauthClientRepo.findById(clientId);
  
  if (!client) {
    throw new Error("Client not found");
  }
  
  // If client uses "all_users" policy, allow
  if (client.accessPolicy === "all_users") {
    return { allowed: true };
  }
  
  // If restricted, check user_client_access
  const accessRepo = new UserClientAccessRepository();
  const { hasAccess, level } = await accessRepo.checkAccess(userId, clientId);
  
  if (!hasAccess) {
    throw new Error("unauthorized_client_access");
  }
  
  return { allowed: true, level };
}
```

#### `src/app/api/verify-api-key/route.ts` - API Key Verification Endpoint
```typescript
import { NextRequest, NextResponse } from "next/server";
import { ApiKeyRepository } from "@/lib/repositories/api-key-repository";
import { hashApiKey } from "@/lib/utils/api-key";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }
  
  const keyHash = hashApiKey(apiKey);
  const repo = new ApiKeyRepository();
  
  const { valid, key } = await repo.verifyKey(keyHash);
  
  if (!valid || !key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }
  
  // Check if key is expired
  if (key.expiresAt && new Date() > key.expiresAt) {
    return NextResponse.json({ error: "API key expired" }, { status: 401 });
  }
  
  return NextResponse.json({
    valid: true,
    clientId: key.metadata?.oauth_client_id,
    permissions: key.permissions,
  });
}
```

---

### 5. UI Components Updates

#### Already Implemented (from previous work):
- ✅ `PermissionRowBuilder` - Resource/action pair management
- ✅ `PermissionTagInput` - Permission tag selection
- ✅ `CollapsibleSection` - Expandable sections
- ✅ `UserGroupPicker` - User/group search modal
- ✅ `AccessControlTable` - Display assigned users/groups
- ✅ `ApiKeyTable` - Display issued API keys

#### New Components Needed:
- `ApiKeyCreationModal` - Form to create new API key
- `ApiKeyRevealModal` - One-time display of generated key
- `AccessPolicySelector` - Toggle between "all_users" and "restricted"
- `GroupManagementPanel` - CRUD for user groups

---

### 6. Migration Strategy

#### Phase 1: Schema Migration
1. Create migration file for new tables
2. Add columns to `oauth_application`
3. Run migration in development
4. Test schema integrity

#### Phase 2: Utilities & Repositories
1. Implement all utility functions with tests
2. Create repository classes
3. Test CRUD operations

#### Phase 3: Backend Actions
1. Implement API key management actions
2. Implement access control actions
3. Add middleware to OAuth flow
4. Create API key verification endpoint

#### Phase 4: UI Integration
1. Wire up existing components to backend
2. Create new modal components
3. Add API key management section
4. Add access control section
5. Test full user flow

#### Phase 5: Documentation & Testing
1. Document API key flow
2. Document access control flow
3. Write integration tests
4. Security audit

---

## File Structure Summary

```
src/
├── lib/
│   ├── utils/
│   │   ├── api-key.ts          [NEW] - API key generation & validation
│   │   ├── permissions.ts      [NEW] - Permission utilities
│   │   ├── access-control.ts   [NEW] - Access control utilities
│   │   └── [existing utils]
│   ├── repositories/
│   │   ├── user-client-access-repository.ts  [NEW]
│   │   ├── api-key-repository.ts             [NEW]
│   │   ├── user-group-repository.ts          [NEW]
│   │   └── [existing repos]
├── db/
│   ├── app-schema.ts           [UPDATE] - Add new tables
│   └── auth-schema.ts          [UPDATE] - Extend oauth_application
├── app/
│   ├── admin/
│   │   └── clients/
│   │       └── [id]/
│   │           ├── api-keys/
│   │           │   └── actions.ts  [NEW]
│   │           └── access-control/
│   │               └── actions.ts  [NEW]
│   └── api/
│       ├── oauth2/
│       │   └── authorize/
│       │       └── route.ts    [UPDATE] - Add access check
│       └── verify-api-key/
│           └── route.ts        [NEW]
├── components/
│   ├── admin/
│   │   ├── access-control-table.tsx   [EXISTS]
│   │   └── api-key-table.tsx          [EXISTS]
│   └── ui/
│       ├── permission-row-builder.tsx [EXISTS]
│       ├── user-group-picker.tsx      [EXISTS]
│       ├── api-key-creation-modal.tsx [NEW]
│       └── access-policy-selector.tsx [NEW]
└── drizzle/
    └── [migration_file].sql    [NEW]
```

---

## Priority Order

### P0 - Critical Path
1. Database schema migration (tables + oauth_application extensions)
2. Basic utility functions (api-key.ts, permissions.ts)
3. Repository implementations
4. OAuth authorize middleware enhancement

### P1 - Core Features
5. API key CRUD actions
6. Access control CRUD actions
7. API key verification endpoint
8. Wire up UI components to backend

### P2 - Polish & Enhancement
9. Group management (optional)
10. Advanced permission validation
11. Rate limiting & quotas
12. Audit logging

---

## Testing Checklist

### Unit Tests
- [ ] API key generation & validation
- [ ] Permission validation logic
- [ ] Access control utilities
- [ ] Repository CRUD operations

### Integration Tests
- [ ] Create API key flow
- [ ] Revoke API key flow
- [ ] Assign user to client
- [ ] Remove user from client
- [ ] OAuth authorize with access check
- [ ] API key verification

### E2E Tests
- [ ] Complete API key lifecycle
- [ ] Access control policy changes
- [ ] User flows with restricted access
- [ ] API key usage in protected endpoints

---

## Security Considerations

1. **API Key Storage**: Store only hashed keys, never plaintext
2. **Key Display**: Show full key only once at creation
3. **Access Control**: Default to permissive, explicit opt-in to restrictions
4. **Audit Trail**: Log all key creation, revocation, access changes
5. **Expiration**: Support key expiration with automatic cleanup
6. **Rate Limiting**: Use Better Auth's built-in rate limiting
7. **Encryption**: Use existing encryption utils for sensitive metadata

---

## Next Steps

1. Review this plan with team
2. Create database migration
3. Implement P0 items
4. Set up testing framework
5. Begin P1 implementation
