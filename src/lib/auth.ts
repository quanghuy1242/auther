import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins/jwt";
import { oidcProvider } from "better-auth/plugins/oidc-provider";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";

import { env } from "@/env";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";

const baseURL = env.PRODUCTION_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  basePath: "/api/auth",
  disabledPaths: ["/token"],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  plugins: [
    jwt({
      jwt: {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE[0],
      },
      disableSettingJwtHeader: true,
    }),
    oidcProvider({
      loginPage: "/sign-in",
      useJWTPlugin: true,
      metadata: {
        issuer: env.JWT_ISSUER,
      },
      trustedClients: [
        {
          clientId: env.PAYLOAD_CLIENT_ID,
          clientSecret: env.PAYLOAD_CLIENT_SECRET,
          type: "web",
          name: "Payload Admin (Confidential)",
          redirectURLs: [env.PAYLOAD_REDIRECT_URI],
          metadata: {
            tokenEndpointAuthMethod: "client_secret_basic",
            grantTypes: ["authorization_code"],
          },
          disabled: false,
          skipConsent: true,
        },
        {
          clientId: env.PAYLOAD_SPA_CLIENT_ID,
          type: "public",
          name: "Payload SPA (PKCE)",
          redirectURLs: env.PAYLOAD_SPA_REDIRECT_URIS,
          metadata: {
            tokenEndpointAuthMethod: "none",
            grantTypes: ["authorization_code"],
            postLogoutRedirectUris: env.PAYLOAD_SPA_LOGOUT_URIS ?? [],
          },
          disabled: false,
          skipConsent: true,
        },
      ],
    }),
    oAuthProxy({
      productionURL: env.PRODUCTION_URL,
      currentURL: env.NEXT_PUBLIC_APP_URL,
    }),
    nextCookies(),
  ],
});

export type Auth = typeof auth;
