import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authenticateClientApiKey } from "@/lib/auth/client-api-key-auth";
import { tupleRepository } from "@/lib/repositories";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ clientId: string; tupleId: string }> }
): Promise<NextResponse> {
  try {
    const _headers = await headers();
    const { clientId, tupleId } = await context.params;

    if (!clientId || !tupleId) {
      return NextResponse.json(
        { error: "missing_fields", message: "clientId and tupleId are required" },
        { status: 400 }
      );
    }

    const authResult = await authenticateClientApiKey(_headers, clientId);
    if ("error" in authResult) {
      return NextResponse.json(authResult.error.body, { status: authResult.error.status });
    }

    const tuple = await tupleRepository.findById(tupleId);
    if (!tuple) {
      return NextResponse.json(
        { error: "not_found", message: "Grant tuple not found" },
        { status: 404 }
      );
    }

    const exactClientEntityType = `client_${clientId}`;
    const namespacedClientPrefix = `${exactClientEntityType}:`;

    if (
      tuple.entityType !== exactClientEntityType &&
      !tuple.entityType.startsWith(namespacedClientPrefix)
    ) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "Cannot revoke a grant tuple outside the API key client scope",
        },
        { status: 403 }
      );
    }

    const deleted = await tupleRepository.deleteById(tupleId);
    if (!deleted) {
      return NextResponse.json(
        { error: "not_found", message: "Grant tuple not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[internal-client-grants:delete] Error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
