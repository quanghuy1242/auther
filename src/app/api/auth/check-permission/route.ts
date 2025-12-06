import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { apiKeyPermissionResolver } from "@/lib/services";
import { buildABACContext, buildUserContext, buildResourceContext } from "@/lib/auth/abac-context";

/**
 * Request body for permission check
 */
interface CheckPermissionRequest {
    apiKey: string;
    entityType: string;
    entityId: string;
    permission: string;
    resource?: {
        id?: string;
        type?: string;
        attributes?: Record<string, unknown>;
    };
}

/**
 * POST /api/auth/check-permission
 * 
 * Check if an API key has permission to perform an action on a resource.
 * Evaluates ABAC policies with the provided context.
 * 
 * This is the runtime permission check endpoint that consuming services
 * should call when they need to authorize an action.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        // Parse request body
        let body: CheckPermissionRequest;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "invalid_request", message: "Invalid JSON in request body" },
                { status: 400 }
            );
        }

        const { apiKey, entityType, entityId, permission, resource } = body;

        // Validate required fields
        if (!apiKey || !entityType || !entityId || !permission) {
            return NextResponse.json(
                { error: "missing_fields", message: "apiKey, entityType, entityId, and permission are required" },
                { status: 400 }
            );
        }

        // Step 1: Verify API key
        const verificationResult = await auth.api.verifyApiKey({
            body: { key: apiKey },
            headers: await headers(),
        });

        if (!verificationResult || !verificationResult.valid) {
            return NextResponse.json(
                { error: "invalid_api_key", message: "The provided API key is invalid or expired" },
                { status: 401 }
            );
        }

        const apiKeyRecord = verificationResult.key;
        if (!apiKeyRecord) {
            return NextResponse.json(
                { error: "internal_error", message: "Failed to extract API key data" },
                { status: 500 }
            );
        }

        // Step 2: Build ABAC context using the helpers
        const context = buildABACContext({
            resource: resource
                ? buildResourceContext({
                    id: resource.id || entityId,
                    type: resource.type || entityType,
                    attributes: resource.attributes || {},
                })
                : undefined,
            user: buildUserContext({
                id: apiKeyRecord.userId,
                type: "apikey",
            }),
            action: permission,
        });

        // Step 3: Check permission with ABAC
        const allowed = await apiKeyPermissionResolver.checkPermissionWithABAC(
            apiKeyRecord.id,
            entityType,
            entityId,
            permission,
            context
        );

        // Step 4: Return result
        return NextResponse.json({
            allowed,
            entityType,
            entityId,
            permission,
            apiKeyId: apiKeyRecord.id,
        });

    } catch (error) {
        console.error("[check-permission] Error:", error);
        return NextResponse.json(
            { error: "internal_error", message: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
