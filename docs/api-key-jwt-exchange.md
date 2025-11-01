# API Key to JWT Exchange Endpoint

## Overview

The `/api/auth/api-key/exchange` endpoint allows clients to exchange a valid API key for a short-lived JWT token. This is useful for scenarios where you want to use API keys for authentication but need JWT tokens for accessing other services.

## Endpoint Details

**URL:** `POST /api/auth/api-key/exchange`  
**Content-Type:** `application/json`  
**Authentication:** None (uses API key in request body)

## Request Format

### Basic Request

```json
{
  "apiKey": "proj_sk_your_api_key_here"
}
```

### Request with Permission Scoping

You can optionally specify required permissions. If the API key doesn't have these permissions, the request will be rejected:

```json
{
  "apiKey": "proj_sk_your_api_key_here",
  "permissions": {
    "projects": ["read", "write"],
    "users": ["read"]
  }
}
```

## Response Format

### Success Response (200 OK)

```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0xMjMifQ...",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "expiresAt": "2025-11-01T12:15:00.000Z"
}
```

**Fields:**
- `token` (string): The JWT token
- `tokenType` (string): Always "Bearer"
- `expiresIn` (number): Token lifetime in seconds (default: 900 = 15 minutes)
- `expiresAt` (string): ISO 8601 timestamp when the token expires

### Error Responses

#### 400 Bad Request - Invalid JSON
```json
{
  "error": "invalid_request",
  "message": "Invalid JSON in request body"
}
```

#### 400 Bad Request - Missing API Key
```json
{
  "error": "missing_api_key",
  "message": "API key is required"
}
```

#### 401 Unauthorized - Invalid API Key
```json
{
  "error": "invalid_api_key",
  "message": "The provided API key is invalid, expired, or lacks required permissions"
}
```

#### 500 Internal Server Error
```json
{
  "error": "internal_error",
  "message": "Token signing keys are not configured"
}
```

## JWT Payload Structure

The generated JWT contains standard claims plus custom claims specific to the API key:

```json
{
  "iss": "https://auth.example.com",
  "aud": "https://api.example.com",
  "sub": "user_12345",
  "iat": 1698844800,
  "exp": 1698845700,
  "scope": "api_key_exchange",
  "apiKeyId": "ak_67890",
  "permissions": {
    "projects": ["read", "write"],
    "users": ["read"]
  }
}
```

**Standard Claims:**
- `iss` (issuer): The JWT issuer URL from `JWT_ISSUER` env variable
- `aud` (audience): The target audience from `JWT_AUDIENCE` env variable
- `sub` (subject): The user ID associated with the API key
- `iat` (issued at): Unix timestamp when the token was issued
- `exp` (expires at): Unix timestamp when the token expires

**Custom Claims:**
- `scope`: Always "api_key_exchange" to identify tokens from this endpoint
- `apiKeyId`: The ID of the API key that was exchanged
- `permissions`: The permissions granted to the API key

## Usage Examples

### Using cURL

```bash
curl -X POST https://auth.example.com/api/auth/api-key/exchange \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "proj_sk_your_api_key_here"
  }'
```

### Using JavaScript/TypeScript

```typescript
const response = await fetch('https://auth.example.com/api/auth/api-key/exchange', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    apiKey: 'proj_sk_your_api_key_here',
  }),
});

if (!response.ok) {
  const error = await response.json();
  console.error('Exchange failed:', error);
  throw new Error(error.message);
}

const data = await response.json();
console.log('JWT Token:', data.token);
console.log('Expires at:', data.expiresAt);

// Use the token for authenticated requests
const apiResponse = await fetch('https://api.example.com/protected-resource', {
  headers: {
    'Authorization': `Bearer ${data.token}`,
  },
});
```

### Using Python

```python
import requests
import json

response = requests.post(
    'https://auth.example.com/api/auth/api-key/exchange',
    headers={'Content-Type': 'application/json'},
    json={'apiKey': 'proj_sk_your_api_key_here'}
)

if not response.ok:
    error = response.json()
    print(f"Exchange failed: {error['message']}")
    raise Exception(error['message'])

data = response.json()
print(f"JWT Token: {data['token']}")
print(f"Expires at: {data['expiresAt']}")

# Use the token for authenticated requests
api_response = requests.get(
    'https://api.example.com/protected-resource',
    headers={'Authorization': f"Bearer {data['token']}"}
)
```

## Verifying the JWT

The JWT can be verified using the JWKS endpoint at `/api/auth/jwks`:

### Using jose (Node.js)

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(
  new URL('https://auth.example.com/api/auth/jwks')
);

const { payload } = await jwtVerify(token, jwks, {
  issuer: 'https://auth.example.com',
  audience: 'https://api.example.com',
});

console.log('User ID:', payload.sub);
console.log('Permissions:', payload.permissions);
```

## Security Considerations

### ✅ Implemented Security Features

1. **Short-lived tokens**: JWTs expire after 15 minutes by default
2. **No caching**: Private keys are decrypted on-demand and never cached
3. **Permission verification**: API keys are verified with optional permission scoping
4. **Audit logging**: All exchange attempts are logged for security monitoring
5. **Error handling**: Comprehensive error handling with appropriate status codes
6. **No information leakage**: Error messages don't reveal sensitive information

### 🔒 Best Practices

1. **API Key Security**:
   - Store API keys securely (environment variables, secrets manager)
   - Never commit API keys to source control
   - Rotate API keys regularly
   - Use different API keys for different environments

2. **JWT Security**:
   - Always use HTTPS in production
   - Validate JWT expiration before use
   - Don't store JWTs in localStorage (use httpOnly cookies or memory)
   - Implement proper token refresh logic (re-exchange API key)

3. **Rate Limiting** (Recommended):
   - Implement rate limiting on the exchange endpoint
   - Track failed attempts and implement exponential backoff
   - Consider IP-based rate limiting

4. **Monitoring**:
   - Monitor exchange request patterns
   - Alert on unusual activity (many failed attempts, high volume)
   - Track token usage and expiration

## Token Refresh Strategy

Unlike traditional OAuth2 refresh tokens, this implementation requires clients to **re-exchange the API key** when the JWT expires. This design choice provides several benefits:

1. **Simplicity**: No need to manage refresh token storage and rotation
2. **Security**: API keys can be revoked at any time, immediately affecting new JWT generation
3. **Flexibility**: Each exchange can specify different permission scopes

### Implementation Pattern

```typescript
class TokenManager {
  private token: string | null = null;
  private expiresAt: Date | null = null;
  
  constructor(private apiKey: string) {}
  
  async getToken(): Promise<string> {
    // Check if token is expired or will expire soon (30 seconds buffer)
    if (!this.token || !this.expiresAt || 
        Date.now() + 30000 > this.expiresAt.getTime()) {
      await this.refreshToken();
    }
    return this.token!;
  }
  
  private async refreshToken(): Promise<void> {
    const response = await fetch('/api/auth/api-key/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to exchange API key');
    }
    
    const data = await response.json();
    this.token = data.token;
    this.expiresAt = new Date(data.expiresAt);
  }
}

// Usage
const tokenManager = new TokenManager('proj_sk_your_api_key_here');

// Automatically handles token refresh
const token = await tokenManager.getToken();
```

## Testing

A test script is provided to verify the endpoint functionality:

```bash
# Set your test API key in .env.local
TEST_API_KEY=proj_sk_your_api_key_here

# Run the test
pnpm apikey:test
```

The test script will:
1. Exchange the API key for a JWT
2. Verify the JWT using the JWKS endpoint
3. Test error cases (invalid key, missing key)
4. Test permission scoping (if applicable)

## Configuration

The endpoint uses the following environment variables:

- `BETTER_AUTH_SECRET`: Used to decrypt the private signing key
- `JWT_ISSUER`: The issuer claim in generated JWTs
- `JWT_AUDIENCE`: The audience claim in generated JWTs (first value used)

## Implementation Details

### Flow Diagram

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ POST /api/auth/api-key/exchange
     │ { apiKey: "..." }
     ▼
┌──────────────────────┐
│  Verify API Key      │◄─── auth.api.verifyApiKey()
└────┬─────────────────┘
     │ ✓ Valid
     ▼
┌──────────────────────┐
│  Fetch Latest JWKS   │◄─── jwksRepository.findLatest()
└────┬─────────────────┘
     │ Get encrypted key
     ▼
┌──────────────────────┐
│  Decrypt Private Key │◄─── symmetricDecrypt()
└────┬─────────────────┘
     │ Decrypted key
     ▼
┌──────────────────────┐
│  Sign JWT            │◄─── SignJWT (jose)
└────┬─────────────────┘
     │ Signed token
     ▼
┌──────────────────────┐
│  Return Response     │
│  {                   │
│    token: "...",     │
│    expiresIn: 900,   │
│    ...               │
│  }                   │
└──────────────────────┘
```

### Key Components

1. **API Key Verification**: Uses better-auth's `verifyApiKey` method
2. **JWKS Repository**: Fetches the latest signing key from the database
3. **Symmetric Decryption**: Decrypts the private key using `BETTER_AUTH_SECRET`
4. **JWT Signing**: Uses the `jose` library to sign JWTs with RS256

## Troubleshooting

### "Invalid API key" error
- Verify the API key is correct and not expired
- Check if the API key is enabled in the database
- Ensure the user associated with the API key exists

### "Token signing keys are not configured" error
- Run JWKS rotation: `curl -X POST http://localhost:3000/api/internal/rotate-jwks`
- Check that JWKS keys exist in the database
- Verify database connection is working

### "Failed to decrypt private key" error
- Verify `BETTER_AUTH_SECRET` is correctly set
- Ensure it matches the secret used when the JWKS keys were created
- Check that the JWKS key in the database is valid

### JWT verification fails
- Ensure the JWT hasn't expired
- Verify the issuer and audience match your configuration
- Check that the JWKS endpoint is accessible
- Confirm you're using the correct JWT (not the API key)

## Migration Guide

If you're adding this endpoint to an existing system:

1. **No database changes required** - Uses existing JWKS infrastructure
2. **No breaking changes** - Existing API key functionality remains unchanged
3. **Backward compatible** - Existing API keys work immediately

## API Reference

### POST /api/auth/api-key/exchange

Exchange an API key for a JWT token.

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | string | Yes | The API key to exchange |
| `permissions` | object | No | Optional permissions to verify |

**Response (200 OK):**
| Field | Type | Description |
|-------|------|-------------|
| `token` | string | The JWT token |
| `tokenType` | string | Always "Bearer" |
| `expiresIn` | number | Token lifetime in seconds |
| `expiresAt` | string | ISO 8601 expiration timestamp |

**Error Codes:**
| Code | Status | Description |
|------|--------|-------------|
| `invalid_request` | 400 | Invalid JSON body |
| `missing_api_key` | 400 | API key not provided |
| `invalid_api_key` | 401 | Invalid, expired, or insufficient permissions |
| `internal_error` | 500 | Server error (keys not configured, decryption failed, etc.) |

## License

This implementation is part of the Better Auth Service project.
