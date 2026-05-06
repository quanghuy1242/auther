import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { authenticateAuthorizationSpaceApiKey } from "@/lib/auth/space-api-key-auth";
import { tupleRepository } from "@/lib/repositories";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ spaceId: string; tupleId: string }> }
): Promise<NextResponse> {
  const requestHeaders = await headers();
  const { spaceId, tupleId } = await context.params;
  const authResult = await authenticateAuthorizationSpaceApiKey(requestHeaders, spaceId);
  if ("error" in authResult) {
    return NextResponse.json(authResult.error.body, { status: authResult.error.status });
  }

  const tuple = await tupleRepository.findById(tupleId);
  if (!tuple || tuple.authorizationSpaceId !== spaceId) {
    return NextResponse.json(
      { error: "not_found", message: "Grant tuple not found in this authorization space" },
      { status: 404 }
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
}
