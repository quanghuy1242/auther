"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { oauthApplication } from "@/db/schema";
import { randomBytes } from "crypto";

const registerClientSchema = z.object({
  name: z.string().min(2, "Client name must be at least 2 characters"),
  type: z.enum(["web", "spa", "native"], "Please select a client type"),
  redirectURLs: z.string().min(1, "At least one redirect URL is required"),
  trusted: z.boolean().optional(),
  grantTypes: z.string().optional(),
  tokenEndpointAuthMethod: z.enum(["client_secret_basic", "client_secret_post", "none"], "Invalid auth method"),
});

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
    await requireAuth();

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

    // Parse redirect URLs (one per line)
    const redirectUrlsArray = redirectURLs
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (redirectUrlsArray.length === 0) {
      return {
        success: false,
        errors: { redirectURLs: "At least one redirect URL is required" },
      };
    }

    // Validate URLs
    for (const url of redirectUrlsArray) {
      try {
        new URL(url);
      } catch {
        return {
          success: false,
          errors: { redirectURLs: `Invalid URL: ${url}` },
        };
      }
    }

    // Parse grant types
    const grantTypesArray = grantTypes
      ? grantTypes.split(",").map((g) => g.trim()).filter((g) => g.length > 0)
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
      userId: trusted ? null : undefined, // Trusted clients don't need userId
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
