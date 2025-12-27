import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins/jwt";
import { oidcProvider } from "better-auth/plugins/oidc-provider";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { username, admin, apiKey } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";

import { env } from "@/env";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { DEFAULT_LOCAL_BASE_URL, OAUTH_AUTHORIZE_PATH } from "@/lib/constants";
import { createWildcardRegexes, partitionWildcardPatterns } from "@/lib/utils/wildcard";
import { collectOrigins, resolveRelativePath } from "@/lib/utils/url";
import {
  registerPreviewRedirect,
  type TrustedClientConfig
} from "@/lib/utils/oauth-client";
import {
  createRestrictedSignupPaths,
  validateInternalSignupAccess
} from "@/lib/utils/auth-middleware";
import { checkOAuthClientAccess } from "@/lib/utils/oauth-authorization";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { createPipelineDatabaseHooks, applyClientContextGrants } from "@/lib/pipelines";
import { metricsService } from "@/lib/services";

const vercelPreviewURL = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : undefined;

const baseURL =
  env.PRODUCTION_URL ?? env.NEXT_PUBLIC_APP_URL ?? vercelPreviewURL ?? DEFAULT_LOCAL_BASE_URL;
const runtimeURL = env.NEXT_PUBLIC_APP_URL ?? vercelPreviewURL ?? baseURL;
const productionURL = env.PRODUCTION_URL ?? baseURL;

const previewOriginPatterns = env.PAYLOAD_PREVIEW_ORIGIN_PATTERNS;
const { exact: previewOriginCandidates, wildcard: previewWildcardOrigins } =
  partitionWildcardPatterns(previewOriginPatterns);
const previewOriginMatchers = createWildcardRegexes(previewOriginPatterns);

const trustedOriginCandidates = [
  baseURL,
  runtimeURL,
  productionURL,
  "https://payload.quanghuy.dev",
  ...previewOriginCandidates,
  env.PAYLOAD_REDIRECT_URI,
  ...env.PAYLOAD_SPA_REDIRECT_URIS,
  ...(env.PAYLOAD_SPA_LOGOUT_URIS ?? []),
];

const wildcardTrustedOrigins = Array.from(
  new Set(["https://*.quanghuy.dev", ...previewWildcardOrigins]),
);

const normalizedTrustedOrigins = Array.from(collectOrigins(trustedOriginCandidates));

export const trustedOrigins = Array.from(
  new Set([...normalizedTrustedOrigins, ...wildcardTrustedOrigins]),
);

const payloadAdminRedirects = new Set<string>([env.PAYLOAD_REDIRECT_URI]);
const payloadSPAInitialRedirects = env.PAYLOAD_SPA_REDIRECT_URIS.filter(Boolean);
const payloadSPARedirects = new Set<string>(payloadSPAInitialRedirects);
const payloadSPALogoutRedirects = new Set<string>(env.PAYLOAD_SPA_LOGOUT_URIS ?? []);

const payloadAdminClient = {
  clientId: env.PAYLOAD_CLIENT_ID,
  clientSecret: env.PAYLOAD_CLIENT_SECRET,
  type: "web" as const,
  name: "Payload Admin (Confidential)",
  redirectURLs: Array.from(payloadAdminRedirects),
  metadata: {
    tokenEndpointAuthMethod: "client_secret_basic",
    grantTypes: ["authorization_code"],
  },
  disabled: false,
  skipConsent: true,
};

const payloadSPAClient = {
  clientId: env.PAYLOAD_SPA_CLIENT_ID,
  type: "public" as const,
  name: "Payload SPA (PKCE)",
  redirectURLs: Array.from(payloadSPARedirects),
  metadata: {
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code"],
    postLogoutRedirectUris: Array.from(payloadSPALogoutRedirects),
  },
  disabled: false,
  skipConsent: true,
};

const dynamicRedirectConfig = new Map<string, TrustedClientConfig>([
  [
    payloadAdminClient.clientId,
    {
      redirectSet: payloadAdminRedirects,
      client: payloadAdminClient,
    },
  ],
  [
    payloadSPAClient.clientId,
    {
      redirectSet: payloadSPARedirects,
      client: payloadSPAClient,
    },
  ],
]);

const restrictedSignupPaths = createRestrictedSignupPaths();

const beforeHook = createAuthMiddleware(async (ctx) => {
  const request = ctx.request;
  if (!request) {
    return;
  }

  const requestUrl = new URL(request.url);
  const relativePath = resolveRelativePath(requestUrl, ctx.context.baseURL);

  validateInternalSignupAccess(
    request,
    relativePath,
    restrictedSignupPaths,
    env.PAYLOAD_CLIENT_SECRET
  );

  if (relativePath === OAUTH_AUTHORIZE_PATH) {
    registerPreviewRedirect(
      requestUrl.searchParams.get("client_id"),
      requestUrl.searchParams.get("redirect_uri"),
      dynamicRedirectConfig,
      previewOriginMatchers
    );

    // Check user access to OAuth client (access control)
    const clientId = requestUrl.searchParams.get("client_id");
    const userId = ctx.context.session?.user?.id;

    if (clientId && userId) {
      const accessCheck = await checkOAuthClientAccess(userId, clientId);

      if (!accessCheck.allowed) {
        // Metric: OIDC authorize access denied
        void metricsService.count("oidc.authorize.access_denied.count", 1, { reason: accessCheck.reason || "unknown" });

        // Return an OAuth error response
        const errorUrl = new URL(requestUrl.searchParams.get("redirect_uri") || "/");
        errorUrl.searchParams.set("error", "access_denied");
        errorUrl.searchParams.set("error_description", accessCheck.reason || "Access denied");

        const state = requestUrl.searchParams.get("state");
        if (state) {
          errorUrl.searchParams.set("state", state);
        }

        // Throw a redirect response to the error URL
        throw new Response(null, {
          status: 302,
          headers: {
            Location: errorUrl.toString(),
          },
        });
      }

      // Apply registration context grants for this client (idempotent)
      // This ensures existing users get the client's registration context permissions
      try {
        await applyClientContextGrants(clientId, userId);
      } catch (err) {
        console.error("Failed to apply client context grants:", err);
        // Non-blocking: don't fail the authorization if grant application fails
      }
    }
  }
});

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  basePath: "/api/auth",
  disabledPaths: ["/token"],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  trustedOrigins,
  hooks: {
    before: beforeHook,
    after: createAuthMiddleware(async (ctx) => {
      // Metric: Login attempts (sign-in path)
      if (ctx.path.startsWith("/sign-in")) {
        const hasSession = !!ctx.context.session;
        void metricsService.count("auth.login.attempt", 1, {
          method: ctx.body?.provider || "email",
          status: hasSession ? "success" : "failure"
        });
      }

      // Metric: Registration success (sign-up path with new session)
      if (ctx.path.startsWith("/sign-up")) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          void metricsService.count("auth.register.success", 1, { method: "email" });
          void metricsService.count("auth.session.created.count", 1, { source: "register" });
        }
      }

      // Metric: Session created via any successful auth
      if (ctx.context.newSession && !ctx.path.startsWith("/sign-up")) {
        void metricsService.count("auth.session.created.count", 1, { source: ctx.path.split("/")[1] || "unknown" });
      }

      // Metric: API key issued (create endpoint success)
      if (ctx.path.includes("/api-key/create") && ctx.context.returned) {
        void metricsService.count("apikey.issued.count", 1);
      }

      // Metric: API key revoked (delete endpoint success)
      if (ctx.path.includes("/api-key/delete") && ctx.context.returned) {
        void metricsService.count("apikey.revoked.count", 1, { reason: "user_initiated" });
      }

      // Metric: OAuth PKCE failure detection (error in authorize response)
      if (ctx.path.includes("/authorize") && ctx.context.returned) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const returnedBody = ctx.context.returned as any;
        if (returnedBody?.error === "invalid_request" && returnedBody?.error_description?.includes("PKCE")) {
          void metricsService.count("oauth.pkce.failure.count", 1, { reason: "code_challenge_missing" });
        }
        if (returnedBody?.error === "invalid_request" && returnedBody?.error_description?.includes("redirect_uri")) {
          void metricsService.count("oauth.redirect_uri.invalid.count", 1);
        }
      }
    }),
  },
  databaseHooks: createPipelineDatabaseHooks(),
  plugins: [
    admin(),
    username(),
    apiKey({
      enableMetadata: true,
      apiKeyHeaders: ["x-api-key"],
      rateLimit: {
        enabled: false, // Per-key rate limiting disabled by default
      },
      // Custom API key getter to track missing headers
      customAPIKeyGetter: (ctx) => {
        const key = ctx.request?.headers.get("x-api-key");
        if (!key && ctx.path.includes("/api-key/verify")) {
          // Metric: API key header missing on verify endpoint
          void metricsService.count("apikey.auth.missing.count", 1);
        }
        return key ?? null;
      },
      // Custom API key validator to track invalid keys
      customAPIKeyValidator: async ({ key }) => {
        // We return true to let built-in validation run (checking DB)
        // But if key format is obviously invalid, track it
        if (!key || key.length < 10) {
          void metricsService.count("apikey.auth.invalid.count", 1, { reason: "malformed" });
          return false;
        }
        return true;
      },
    }),
    jwt({
      jwt: {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE[0],
      },
    }),
    oidcProvider({
      loginPage: "/sign-in",
      allowDynamicClientRegistration: true,
      useJWTPlugin: true,
      metadata: {
        issuer: env.JWT_ISSUER,
      },
      trustedClients: [payloadAdminClient, payloadSPAClient],
    }),
    oAuthProxy({
      productionURL,
      currentURL: runtimeURL,
    }),
    nextCookies(),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: { token: any, user: any }) {
      if (user) {
        try {
          const { PermissionService } = await import("@/lib/auth/permission-service");
          const permissionService = new PermissionService();
          // Use ABAC-aware method so consuming services know which permissions
          // require runtime ABAC evaluation via POST /api/auth/check-permission
          const { permissions, abac_required } = await permissionService.resolveAllPermissionsWithABACInfo(user.id);
          token.permissions = permissions;
          // Only include abac_required if there are any ABAC policies
          if (Object.keys(abac_required).length > 0) {
            token.abac_required = abac_required;
          }
        } catch (error) {
          console.error("Failed to inject permissions into JWT:", error);
        }
      }
      return token;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: { session: any, token: any }) {
      if (token && token.permissions) {
        session.user.permissions = token.permissions;
      }
      // Also pass abac_required to session so client knows which permissions need ABAC
      if (token && token.abac_required) {
        session.user.abac_required = token.abac_required;
      }
      return session;
    },
  },
});

export type Auth = typeof auth;
