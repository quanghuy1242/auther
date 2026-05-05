/**
 * OAuth client configuration and management utilities
 */

import { eq } from "drizzle-orm";

import { oauthApplication } from "@/db/schema";
import { db } from "@/lib/db";
import { parseRedirectUrls, serializeRedirectUrls } from "@/lib/client-utils";
import { collectOrigins } from "@/lib/utils/url";

/**
 * Checks if a redirect URI matches preview origin patterns
 */
export function isPreviewRedirect(
  redirectURI: string,
  previewOriginMatchers: RegExp[]
): boolean {
  if (!previewOriginMatchers.length) {
    return false;
  }
  
  if (previewOriginMatchers.some((regex) => regex.test(redirectURI))) {
    return true;
  }
  
  try {
    const origin = new URL(redirectURI).origin;
    return previewOriginMatchers.some((regex) => regex.test(origin));
  } catch {
    return false;
  }
}

export async function registerPreviewRedirectForClient(
  clientId: string | null,
  redirectURI: string | null,
  previewOriginMatchers: RegExp[]
): Promise<void> {
  if (!clientId) {
    return;
  }

  const [client] = await db
    .select({
      redirectURLs: oauthApplication.redirectURLs,
    })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1);

  if (!client) {
    return;
  }

  const redirects = parseRedirectUrls(client.redirectURLs);
  const shouldAddPreviewRedirect =
    redirectURI !== null &&
    isPreviewRedirect(redirectURI, previewOriginMatchers) &&
    !redirects.includes(redirectURI);
  const nextRedirects = shouldAddPreviewRedirect ? [...redirects, redirectURI] : redirects;
  const serializedRedirects = serializeRedirectUrls(nextRedirects);

  if (client.redirectURLs === serializedRedirects) {
    return;
  }

  await db
    .update(oauthApplication)
    .set({
      redirectURLs: serializedRedirects,
      updatedAt: new Date(),
    })
    .where(eq(oauthApplication.clientId, clientId));
}

export async function isRegisteredOAuthClientOrigin(origin: string | null): Promise<boolean> {
  if (!origin) {
    return false;
  }

  const clients = await db
    .select({
      redirectURLs: oauthApplication.redirectURLs,
      metadata: oauthApplication.metadata,
      disabled: oauthApplication.disabled,
    })
    .from(oauthApplication);

  for (const client of clients) {
    if (client.disabled) {
      continue;
    }

    const redirectOrigins = collectOrigins(parseRedirectUrls(client.redirectURLs));
    if (redirectOrigins.has(origin)) {
      return true;
    }

    if (!client.metadata) {
      continue;
    }

    try {
      const metadata = JSON.parse(client.metadata) as { postLogoutRedirectUris?: unknown };
      const logoutUris = Array.isArray(metadata.postLogoutRedirectUris)
        ? metadata.postLogoutRedirectUris.filter((value): value is string => typeof value === "string")
        : [];

      if (collectOrigins(logoutUris).has(origin)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
