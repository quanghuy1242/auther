import { NextRequest, NextResponse } from "next/server";
import { registrationContextService } from "@/lib/services/registration-context-service";
import { queueContextGrant } from "@/lib/pipelines/registration-grants";

/**
 * API Route: POST /api/auth/verify-invite
 * 
 * Verifies a signed invite token for invite-only registration contexts.
 * If valid, queues the context grant for application after user creation.
 * 
 * Request body:
 * {
 *   token: string;    // The signed invite token
 *   email: string;    // The email address to register
 * }
 * 
 * Response:
 * {
 *   valid: boolean;
 *   contextSlug?: string;
 *   error?: string;
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token, email } = body;

        if (!token || typeof token !== "string") {
            return NextResponse.json(
                { valid: false, error: "Token is required" },
                { status: 400 }
            );
        }

        if (!email || typeof email !== "string") {
            return NextResponse.json(
                { valid: false, error: "Email is required" },
                { status: 400 }
            );
        }

        // Verify the signed invite token
        const verification = await registrationContextService.validateInvite(token, email);

        if (!verification.valid) {
            return NextResponse.json(
                { valid: false, error: verification.error || "Invalid token" },
                { status: 400 }
            );
        }

        if (!verification.context) {
            return NextResponse.json(
                { valid: false, error: "Registration context not found" },
                { status: 400 }
            );
        }

        if (!verification.context.enabled) {
            return NextResponse.json(
                { valid: false, error: "Registration context is not active" },
                { status: 400 }
            );
        }

        // Queue the context grant for application after user creation
        queueContextGrant(
            email,
            verification.context.slug,
            verification.invite?.id
        );

        return NextResponse.json({
            valid: true,
            contextSlug: verification.context.slug,
        });
    } catch (error) {
        console.error("Invite verification error:", error);
        return NextResponse.json(
            { valid: false, error: "Failed to verify invite" },
            { status: 500 }
        );
    }
}
