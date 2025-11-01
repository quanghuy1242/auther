"use client";

import { createAuthClient } from "better-auth/react";
import { apiKeyClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: "/api/auth",
  plugins: [
    apiKeyClient(), // Enables API key management methods
  ],
});

