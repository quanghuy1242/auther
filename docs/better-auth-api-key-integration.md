# Better Auth API Key Integration

## Overview

You're absolutely right - we should leverage Better Auth's comprehensive API key plugin instead of reimplementing key generation and management. Better Auth handles all the heavy lifting for us.

## What Better Auth Provides

### Built-in API Key Management

Better Auth's `apiKey` plugin automatically provides:

1. **API Key Generation**
   - Secure key generation with custom prefixes
   - Automatic hashing and storage
   - Format: `{prefix}_{random_string}`

2. **Database Table**
   - Automatically adds `apiKey` table to `auth-schema.ts`
   - Fields: id, userId, key (hashed), name, expiresAt, metadata, permissions, enabled, rate limiting fields

3. **REST API Endpoints**
   - `POST /api-key/create` - Create new API key
   - `POST /api-key/verify` - Verify key and check permissions
   - `GET /api-key/list` - List user's API keys
   - `POST /api-key/delete` - Revoke an API key
   - `GET /api-key/get` - Get key details by ID

4. **Built-in Features**
   - Rate limiting (token bucket algorithm)
   - Permission checking
   - Metadata support (perfect for storing `oauth_client_id`)
   - Expiration handling
   - Automatic cleanup of expired keys

## Configuration

### Server Configuration (Already Done)

```typescript
// src/lib/auth.ts
import { apiKey } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    apiKey({
      prefix: "ba", // API key prefix
      enableMetadata: true, // Allow storing oauth_client_id
      apiKeyHeaders: ["x-api-key"],
      rateLimit: {
        enabled: false, // Can be enabled per-key
        timeWindow: 1000 * 60 * 60 * 24,
        maxRequests: 10
      }
    })
  ]
});
```

### Client Configuration (Needed)

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { apiKeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    apiKeyClient() // Adds API key methods to client
  ]
});
```

## Usage Examples

### Create API Key with OAuth Client Association

```typescript
// In backend action
import { auth } from "@/lib/auth";

const apiKey = await auth.api.createApiKey({
  body: {
    name: "Production API Key",
    userId: user.id,
    metadata: {
      oauth_client_id: clientId // Store client association
    },
    permissions: {
      projects: ["read", "write"],
      users: ["read"]
    },
    expiresIn: 60 * 60 * 24 * 365 // 1 year in seconds
  }
});

// apiKey.key is the raw key - show this ONCE to user
// apiKey.id is the database ID for revocation
```

### Verify API Key with Permission Check

```typescript
// Better Auth provides /api-key/verify endpoint
const result = await auth.api.verifyApiKey({
  body: {
    key: request.headers.get("x-api-key"),
    permissions: {
      projects: ["read"] // Check if key has this permission
    }
  }
});

if (!result.valid) {
  return Response.json({ error: "Invalid or insufficient permissions" }, { status: 401 });
}

// Extract client from metadata
const clientId = result.metadata?.oauth_client_id;
```

### List User's API Keys

```typescript
// In frontend component or backend action
const keys = await authClient.apiKey.list();

// Returns array of:
// { id, name, enabled, permissions, metadata, expiresAt, ... }
// NOTE: The actual key string is NEVER returned after creation
```

### Revoke API Key

```typescript
await authClient.apiKey.revoke({
  id: apiKeyId
});
```

## Refactored Implementation

### What We Removed

❌ **src/lib/utils/api-key.ts:**
- `generateApiKey()` - Better Auth handles this
- `hashApiKey()` - Better Auth handles this
- Kept only: `generateApiKeyId()` for non-API-key records, `extractApiKeyPrefix()`, `isValidApiKeyFormat()`

❌ **src/lib/repositories/api-key-repository.ts:**
- Completely removed - use Better Auth's API directly
- No need to wrap what Better Auth already provides

### What We Kept

✅ **src/lib/repositories/user-client-access-repository.ts** - Access control
✅ **src/lib/repositories/oauth-client-metadata-repository.ts** - Extended client config
✅ **src/lib/repositories/user-group-repository.ts** - Group management
✅ **src/lib/utils/permissions.ts** - Permission validation utilities
✅ **src/lib/utils/access-control.ts** - Access level utilities

## Integration with Our Access Control

### Storing OAuth Client Association

Use Better Auth's metadata field:

```typescript
const apiKey = await auth.api.createApiKey({
  body: {
    metadata: {
      oauth_client_id: clientId,
      access_level: "use" // or "admin"
    }
  }
});
```

### Checking Access on API Key Verification

```typescript
// 1. Verify the API key
const result = await auth.api.verifyApiKey({ body: { key } });

if (!result.valid) {
  return unauthorized();
}

// 2. Extract client from metadata
const clientId = result.metadata?.oauth_client_id;

if (!clientId) {
  return Response.json({ error: "API key not associated with client" }, { status: 400 });
}

// 3. Check user-client access using our repository
const access = await userClientAccessRepository.checkAccess(result.userId, clientId);

if (!access.hasAccess) {
  return Response.json({ error: "Access denied to this client" }, { status: 403 });
}

// 4. Validate permissions against client's allowed resources
const clientMetadata = await oauthClientMetadataRepository.findByClientId(clientId);

if (clientMetadata?.allowedResources) {
  const hasPermission = validatePermissions(
    result.permissions, // Permissions from API key
    clientMetadata.allowedResources // Client's allowed resources
  );
  
  if (!hasPermission) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }
}
```

## Updated Phase 3 & 4 Plan

### Phase 3: ✅ Complete
- UserClientAccessRepository
- OAuthClientMetadataRepository  
- UserGroupRepository
- ~~ApiKeyRepository~~ (removed - use Better Auth)

### Phase 4: Backend Actions (Updated)

1. **Access Control Actions**
   - `assignUserToClient(userId, clientId, accessLevel)`
   - `removeUserFromClient(userId, clientId)`
   - `updateClientAccessPolicy(clientId, policy)`

2. **API Key Actions (Simplified)**
   ```typescript
   // Wrapper around Better Auth API
   async function createClientApiKey(userId: string, clientId: string, permissions: ResourcePermissions) {
     // 1. Check user has access to client
     const access = await userClientAccessRepository.checkAccess(userId, clientId);
     if (!access.hasAccess) throw new Error("Access denied");
     
     // 2. Validate permissions against client's allowed resources
     const metadata = await oauthClientMetadataRepository.findByClientId(clientId);
     if (!metadata?.allowsApiKeys) throw new Error("Client doesn't allow API keys");
     
     validatePermissions(permissions, metadata.allowedResources);
     
     // 3. Create API key using Better Auth
     return auth.api.createApiKey({
       body: {
         userId,
         name: `${clientId} API Key`,
         metadata: { oauth_client_id: clientId },
         permissions,
         expiresIn: 60 * 60 * 24 * 365 // 1 year
       }
     });
   }
   ```

3. **OAuth Authorization Enhancement**
   - No changes needed - continue using `userClientAccessRepository.checkAccess()`

## Benefits of Using Better Auth

1. **Security** - Battle-tested hashing and storage
2. **Features** - Rate limiting, expiration, permissions out of the box
3. **Maintenance** - Updates and security patches from Better Auth
4. **Standards** - Follows OAuth 2.0 best practices
5. **Less Code** - No need to reimplement what's already perfect

## Migration Notes

If you've already run migrations with a custom `apiKey` table, you'll need to:

1. Drop the custom table
2. Re-run `pnpm run db:generate` to get Better Auth's table
3. Run `pnpm run db:push` to apply

The Better Auth table schema is compatible with our needs and includes all required fields plus extras like rate limiting.

## Next Steps

1. ✅ Add `apiKeyClient` plugin to auth-client.ts
2. Create UI components for API key management (using Better Auth's client methods)
3. Create wrapper actions for business logic (access control checks)
4. Update API routes to use `/api-key/verify` for authentication
