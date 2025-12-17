"use server";

/**
 * Origin Validation Middleware
 * 
 * Validates that requests for open registration contexts come from allowed origins.
 * This is called during sign-up when a user is registering through an open context.
 */

import { headers } from "next/headers";
import { registrationContextRepo } from "@/lib/repositories/platform-access-repository";

export interface OriginValidationResult {
    valid: boolean;
    error?: string;
    contextSlug?: string;
}

/**
 * Validate origin for open registration context.
 * Returns the context slug if valid, or an error if not.
 */
export async function validateOriginForContext(
    contextSlug: string
): Promise<OriginValidationResult> {
    try {
        // Get request origin
        const headersList = await headers();
        const origin = headersList.get("origin") || headersList.get("referer");

        if (!origin) {
            return { valid: false, error: "No origin header present" };
        }

        // Parse origin to get hostname
        let originHost: string;
        try {
            const url = new URL(origin);
            originHost = url.origin;
        } catch {
            return { valid: false, error: "Invalid origin format" };
        }

        // Get the registration context
        const context = await registrationContextRepo.findBySlug(contextSlug);

        if (!context) {
            return { valid: false, error: "Registration context not found" };
        }

        if (!context.enabled) {
            return { valid: false, error: "Registration context is not active" };
        }

        // Check if this is an open context (has allowed origins)
        // Contexts without allowedOrigins typically require an invite
        if (!context.allowedOrigins || context.allowedOrigins.length === 0) {
            return {
                valid: false,
                error: "This context requires an invite token"
            };
        }

        // Validate origin against allowed origins
        const allowedOrigins = context.allowedOrigins || [];

        // Check if origin matches any allowed origin
        // Support wildcard matching (e.g., "*.example.com")
        const isAllowed = allowedOrigins.some((allowed) => {
            if (allowed === "*") {
                return true; // Allow all origins
            }

            if (allowed.startsWith("*.")) {
                // Wildcard subdomain matching
                const domain = allowed.slice(2);
                try {
                    const originUrl = new URL(origin);
                    return originUrl.hostname.endsWith(domain) ||
                        originUrl.hostname === domain.slice(1);
                } catch {
                    return false;
                }
            }

            // Exact match
            return originHost === allowed;
        });

        if (!isAllowed) {
            return {
                valid: false,
                error: "Origin not allowed for this registration context"
            };
        }

        return { valid: true, contextSlug };
    } catch (error) {
        console.error("Origin validation error:", error);
        return {
            valid: false,
            error: "Failed to validate origin"
        };
    }
}

/**
 * Middleware helper to validate and queue context grant during sign-up.
 * Call this at the start of sign-up flow when a context slug is provided.
 */
export async function validateAndQueueContextGrant(
    email: string,
    contextSlug: string
): Promise<OriginValidationResult> {
    const validation = await validateOriginForContext(contextSlug);

    if (!validation.valid) {
        return validation;
    }

    // Queue the context grant for application after user creation
    const { queueContextGrant } = await import("@/lib/pipelines/registration-grants");
    queueContextGrant(email, contextSlug);

    return { valid: true, contextSlug };
}
