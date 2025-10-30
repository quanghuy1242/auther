"use server";

import { db } from "@/lib/db";
import { oauthApplication, oauthAccessToken } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "crypto";

export interface ClientDetail {
  id: string;
  clientId: string;
  clientSecret: string | null;
  name: string | null;
  icon: string | null;
  redirectURLs: string[];
  type: string | null;
  disabled: boolean;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    type?: string;
    grantTypes?: string[];
    tokenEndpointAuthMethod?: string;
    trusted?: boolean;
  };
  lastUsed: Date | null;
  activeTokenCount: number;
}

const updateClientSchema = z.object({
  name: z.string().min(2, "Client name must be at least 2 characters"),
  redirectURLs: z.string().min(1, "At least one redirect URL is required"),
});

export type UpdateClientState = {
  success: boolean;
  error?: string;
  errors?: Record<string, string>;
};

/**
 * Get OAuth client by ID with usage statistics
 */
export async function getClientById(clientId: string): Promise<ClientDetail | null> {
  try {
    await requireAuth();

    // Get client
    const [client] = await db
      .select()
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, clientId))
      .limit(1);

    if (!client) {
      return null;
    }

    // Get usage statistics
    const tokens = await db
      .select({
        createdAt: oauthAccessToken.createdAt,
      })
      .from(oauthAccessToken)
      .where(eq(oauthAccessToken.clientId, clientId))
      .orderBy(desc(oauthAccessToken.createdAt))
      .limit(1);

    // Parse metadata and redirectURLs
    let metadata = {};
    try {
      metadata = client.metadata ? JSON.parse(client.metadata) : {};
    } catch (error) {
      console.error("Failed to parse metadata:", client.metadata, error);
      metadata = {};
    }

    let redirectURLs: string[] = [];
    try {
      if (client.redirectURLs) {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(client.redirectURLs);
          redirectURLs = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
        } catch {
          // If JSON parsing fails, treat as plain text (split by newlines or commas)
          redirectURLs = client.redirectURLs
            .split(/[\n,]/)
            .map((url: string) => url.trim())
            .filter((url: string) => url.length > 0);
        }
        console.log("Parsed redirectURLs:", redirectURLs, "from:", client.redirectURLs);
      }
    } catch (error) {
      console.error("Failed to parse redirectURLs:", client.redirectURLs, error);
      redirectURLs = [];
    }

    // Count active tokens
    const [tokenCount] = await db
      .select({
        count: oauthAccessToken.id,
      })
      .from(oauthAccessToken)
      .where(eq(oauthAccessToken.clientId, clientId));

    return {
      id: client.id,
      clientId: client.clientId || "",
      clientSecret: client.clientSecret,
      name: client.name,
      icon: client.icon,
      redirectURLs,
      type: client.type,
      disabled: client.disabled || false,
      userId: client.userId,
      createdAt: client.createdAt || new Date(),
      updatedAt: client.updatedAt || new Date(),
      metadata,
      lastUsed: tokens[0]?.createdAt || null,
      activeTokenCount: tokenCount ? 1 : 0,
    };
  } catch (error) {
    console.error("Get client by ID error:", error);
    return null;
  }
}

/**
 * Update OAuth client details
 */
export async function updateClient(
  clientId: string,
  prevState: { success: boolean; errors?: Record<string, string>; data?: unknown },
  formData: FormData
): Promise<{ success: boolean; errors?: Record<string, string>; data?: unknown; error?: string }> {
  try {
    await requireAuth();

    const rawData = {
      name: formData.get("name"),
      redirectURLs: formData.get("redirectURLs"),
    };

    const result = updateClientSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          errors[issue.path[0].toString()] = issue.message;
        }
      });
      return { success: false, errors };
    }

    const { name, redirectURLs } = result.data;

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

    // Update client
    await db
      .update(oauthApplication)
      .set({
        name,
        redirectURLs: JSON.stringify(redirectUrlsArray),
        updatedAt: new Date(),
      })
      .where(eq(oauthApplication.clientId, clientId));

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Update client error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Rotate client secret (confidential clients only)
 */
export async function rotateClientSecret(clientId: string): Promise<{ success: boolean; secret?: string; error?: string }> {
  try {
    await requireAuth();

    // Check if client exists and has a secret
    const [client] = await db
      .select()
      .from(oauthApplication)
      .where(eq(oauthApplication.clientId, clientId))
      .limit(1);

    if (!client) {
      return { success: false, error: "Client not found" };
    }

    if (!client.clientSecret) {
      return { success: false, error: "Cannot rotate secret for public clients" };
    }

    // Generate new secret
    const newSecret = randomBytes(32).toString("base64url");

    // Update client
    await db
      .update(oauthApplication)
      .set({
        clientSecret: newSecret,
        updatedAt: new Date(),
      })
      .where(eq(oauthApplication.clientId, clientId));

    // Revoke all existing tokens for this client
    await db
      .delete(oauthAccessToken)
      .where(eq(oauthAccessToken.clientId, clientId));

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/clients");

    return { success: true, secret: newSecret };
  } catch (error) {
    console.error("Rotate client secret error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Toggle client disabled status
 */
export async function toggleClientStatus(clientId: string, disabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    await db
      .update(oauthApplication)
      .set({
        disabled,
        updatedAt: new Date(),
      })
      .where(eq(oauthApplication.clientId, clientId));

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Toggle client status error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Delete OAuth client (soft delete via disabled flag)
 */
export async function deleteClient(clientId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAuth();

    // Soft delete by setting disabled flag
    await db
      .update(oauthApplication)
      .set({
        disabled: true,
        updatedAt: new Date(),
      })
      .where(eq(oauthApplication.clientId, clientId));

    // Revoke all tokens
    await db
      .delete(oauthAccessToken)
      .where(eq(oauthAccessToken.clientId, clientId));

    revalidatePath("/admin/clients");

    return { success: true };
  } catch (error) {
    console.error("Delete client error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
