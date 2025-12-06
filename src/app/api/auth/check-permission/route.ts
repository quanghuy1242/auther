import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { PermissionService } from "@/lib/auth/permission-service";
import { buildABACContext, buildUserContext, buildResourceContext } from "@/lib/auth/abac-context";

/**
 * Request body for permission check
 */
interface CheckPermissionRequest {
    // apiKey is now optional/deprecated in body, prefer header x-api-key
    apiKey?: string;
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
 * Check if an actor (API Key OR User) has permission to perform an action.
 * Evaluates ABAC policies with the provided context.
 * 
 * Auth Methods (Headers):
 * - x-api-key: <key>
 * - Authorization: Bearer <token>
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const _headers = await headers();

        // 1. Parse Body
        let body: CheckPermissionRequest;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { error: "invalid_request", message: "Invalid JSON in request body" },
                { status: 400 }
            );
        }

        const { entityType, entityId, permission, resource } = body;

        // Validate required fields
        if (!entityType || !entityId || !permission) {
            return NextResponse.json(
                { error: "missing_fields", message: "entityType, entityId, and permission are required" },
                { status: 400 }
            );
        }

        let subjectType: "user" | "apikey";
        let subjectId: string;
        let apiKeyRecordId: string | undefined;

        // 2. Authenticate
        const headerApiKey = _headers.get("x-api-key");
        const authHeader = _headers.get("authorization");
        const bodyApiKey = body.apiKey; // Legacy support

        // A. Try API Key (Header prioritised, then Body)
        const apiKeyToVerify = headerApiKey || bodyApiKey;

        if (apiKeyToVerify) {
            const verificationResult = await auth.api.verifyApiKey({
                body: { key: apiKeyToVerify },
                headers: _headers,
            });

            if (!verificationResult || !verificationResult.valid || !verificationResult.key) {
                return NextResponse.json(
                    { error: "invalid_api_key", message: "The provided API key is invalid or expired" },
                    { status: 401 }
                );
            }
            subjectType = "apikey";
            subjectId = verificationResult.key.id; // API Key ID is the subject for ReBAC
            apiKeyRecordId = verificationResult.key.id;
        }
        // B. Try User Session (Bearer Token)
        else if (authHeader?.startsWith("Bearer ")) {
            const session = await auth.api.getSession({
                headers: _headers,
            });

            if (!session || !session.user) {
                return NextResponse.json(
                    { error: "invalid_token", message: "Invalid or expired session token" },
                    { status: 401 }
                );
            }
            subjectType = "user";
            subjectId = session.user.id;
        }
        // C. No credentials
        else {
            return NextResponse.json(
                { error: "unauthorized", message: "Missing authentication requirements" },
                { status: 401 }
            );
        }

        // 3. Check Permission
        const permissionService = new PermissionService();

        // Build Context
        const context = buildABACContext({
            resource: resource
                ? buildResourceContext({
                    id: resource.id || entityId,
                    type: resource.type || entityType,
                    attributes: resource.attributes || {},
                })
                : undefined,
            user: buildUserContext({
                id: subjectType === "apikey" && apiKeyRecordId ? apiKeyRecordId : subjectId,
                type: subjectType,
                // If user, we might want to inject email/name if available in session,
                // but buildUserContext typically handles basic fields. 
            }),
            action: permission,
        });

        const allowed = await permissionService.checkPermission(
            subjectType,
            subjectId,
            entityType,
            entityId,
            permission,
            context as Record<string, unknown>
        );

        // 4. Return result
        return NextResponse.json({
            allowed,
            entityType,
            entityId,
            permission,
            subjectType,
            subjectId,
        });

    } catch (error) {
        console.error("[check-permission] Error:", error);
        return NextResponse.json(
            { error: "internal_error", message: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
