export const CLIENT_TYPES = ["web", "spa", "native"] as const;
export type ClientType = typeof CLIENT_TYPES[number];

export const AUTH_METHODS = ["client_secret_basic", "client_secret_post", "private_key_jwt", "none"] as const;
export type AuthMethod = typeof AUTH_METHODS[number];

export const GRANT_TYPES = ["authorization_code", "refresh_token", "client_credentials", "implicit", "password"] as const;
export type GrantType = typeof GRANT_TYPES[number];

export const TOKEN_ENDPOINT_AUTH_METHOD_OPTIONS = [
  { value: "client_secret_basic", label: "Client Secret Basic - HTTP Basic Auth (recommended)" },
  { value: "client_secret_post", label: "Client Secret Post - POST body parameters" },
  { value: "none", label: "None - Public client (SPA/Native apps)" },
];

export const GRANT_TYPE_DETAILS = [
  { value: "authorization_code", label: "Authorization Code", description: "Standard server-side flow" },
  { value: "refresh_token", label: "Refresh Token", description: "Get new access tokens" },
  { value: "client_credentials", label: "Client Credentials", description: "Machine-to-machine auth" },
  { value: "implicit", label: "Implicit", description: "Legacy browser flow (not recommended)" },
  { value: "password", label: "Password", description: "Resource owner password (not recommended)" },
];

export const APPLICATION_TYPE_OPTIONS = [
  { value: "web", label: "Web Application - Server-side app with client secret" },
  { value: "spa", label: "Single Page App - Browser-based app without secret" },
  { value: "native", label: "Native App - Mobile or desktop application" },
];
