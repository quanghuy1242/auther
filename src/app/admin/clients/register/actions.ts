"use server";

import { revalidatePath } from "next/cache";
import { guards } from "@/lib/auth/platform-guard";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { oauthApplication } from "@/db/schema";
import { randomBytes } from "crypto";
import { parseRedirectUrls, findInvalidUrl, parseGrantTypes } from "@/lib/client-utils";
import { registerClientSchema } from "@/schemas/clients";

export type RegisterClientState = {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
  data?: {
    clientId: string;
    clientSecret?: string;
  };
};

function generateClientId(): string {
  return `client_${randomBytes(16).toString("hex")}`;
}

function generateClientSecret(): string {
  return randomBytes(32).toString("base64url");
}

export async function registerClient(
  prevState: { success: boolean; errors?: Record<string, string>; data?: unknown },
  formData: FormData
): Promise<{ success: boolean; errors?: Record<string, string>; data?: unknown; error?: string }> {
  try {
    await guards.clients.create();
    const session = await getSession();
    if (!session) throw new Error("Unauthorized");

    const rawData = {
      name: formData.get("name"),
      type: formData.get("type"),
      redirectURLs: formData.get("redirectURLs"),
      trusted: formData.get("trusted") === "true",
      grantTypes: formData.get("grantTypes"),
      tokenEndpointAuthMethod: formData.get("tokenEndpointAuthMethod"),
    };

    const result = registerClientSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0].toString()] = issue.message;
        }
      });
      return { success: false, errors };
    }

    const {
      name,
      type,
      redirectURLs,
      trusted,
      grantTypes,
      tokenEndpointAuthMethod,
    } = result.data;

    // Parse redirect URLs
    const redirectUrlsArray = parseRedirectUrls(redirectURLs);

    if (redirectUrlsArray.length === 0) {
      return {
        success: false,
        errors: { redirectURLs: "At least one redirect URL is required" },
      };
    }

    // Validate URLs
    const invalidUrl = findInvalidUrl(redirectUrlsArray);
    if (invalidUrl) {
      return {
        success: false,
        errors: { redirectURLs: `Invalid URL: ${invalidUrl}` },
      };
    }

    // Parse grant types
    const grantTypesArray = grantTypes
      ? parseGrantTypes(grantTypes)
      : ["authorization_code", "refresh_token"];

    // Generate client credentials
    const id = `oauth_app_${randomBytes(8).toString("hex")}`;
    const clientId = generateClientId();
    const clientSecret = tokenEndpointAuthMethod !== "none" ? generateClientSecret() : null;

    // Build metadata
    const metadata = {
      type,
      grantTypes: grantTypesArray,
      tokenEndpointAuthMethod,
      trusted: trusted || false,
    };

    // Insert into database
    await db.insert(oauthApplication).values({
      id,
      clientId,
      clientSecret,
      name,
      redirectURLs: JSON.stringify(redirectUrlsArray),
      metadata: JSON.stringify(metadata),
      type,
      userId: trusted ? session.user.id : null, // Use owning admin to mark trusted clients
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    revalidatePath("/admin/clients");

    return {
      success: true,
      data: {
        clientId,
        clientSecret: clientSecret || undefined,
      },
    };
  } catch (error) {
    console.error("Register client error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
