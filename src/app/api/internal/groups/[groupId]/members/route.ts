import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { PermissionService } from "@/lib/auth/permission-service";
import { UserGroupRepository } from "@/lib/repositories/user-group-repository";
import { UserRepository } from "@/lib/repositories/user-repository";

/**
 * GET /api/internal/groups/:groupId/members
 * Returns expanded user members for a group (direct + nested group expansion).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ groupId: string }> }
): Promise<NextResponse> {
  try {
    const _headers = await headers();
    const { groupId } = await context.params;
    const userRepository = new UserRepository();

    if (!groupId) {
      return NextResponse.json(
        { error: "missing_fields", message: "groupId is required" },
        { status: 400 }
      );
    }

    const headerApiKey = _headers.get("x-api-key");
    const authHeader = _headers.get("authorization");

    if (headerApiKey) {
      const verification = await auth.api.verifyApiKey({
        body: { key: headerApiKey },
        headers: _headers,
      });

      if (!verification || !verification.valid || !verification.key) {
        return NextResponse.json(
          { error: "invalid_api_key", message: "The provided API key is invalid or expired" },
          { status: 401 }
        );
      }

      const ownerUserId = verification.key.userId;
      if (!ownerUserId) {
        return NextResponse.json(
          {
            error: "forbidden",
            message: "API key is not associated with an owning user",
          },
          { status: 403 }
        );
      }

      const owner = await userRepository.findById(ownerUserId);
      if (!owner || owner.role !== "admin") {
        return NextResponse.json(
          {
            error: "forbidden",
            message: "Admin role is required for API key access to this endpoint",
          },
          { status: 403 }
        );
      }
    } else if (authHeader?.startsWith("Bearer ")) {
      const session = await auth.api.getSession({ headers: _headers });
      if (!session?.user) {
        return NextResponse.json(
          { error: "invalid_token", message: "Invalid or expired session token" },
          { status: 401 }
        );
      }

      const role = "role" in session.user ? session.user.role : undefined;
      if (role !== "admin") {
        return NextResponse.json(
          {
            error: "forbidden",
            message: "Admin role is required to query internal group members",
          },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "unauthorized", message: "Missing authentication requirements" },
        { status: 401 }
      );
    }

    const groupRepository = new UserGroupRepository();
    const group = await groupRepository.findById(groupId);

    if (!group) {
      return NextResponse.json(
        { error: "not_found", message: "Group not found" },
        { status: 404 }
      );
    }

    const permissionService = new PermissionService();
    const memberIds = await permissionService.getExpandedGroupMembersStrict(groupId);

    return NextResponse.json({
      groupId,
      memberIds,
      count: memberIds.length,
    });
  } catch (error) {
    console.error("[internal-group-members] Error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
