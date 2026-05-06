import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "legacy_client_grants_removed",
      message: "Client-scoped grants are removed. Use /api/internal/authorization-spaces/{spaceId}/grants.",
    },
    { status: 410 }
  );
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: "legacy_client_grants_removed",
      message: "Client-scoped grants are removed. Use /api/internal/authorization-spaces/{spaceId}/grants.",
    },
    { status: 410 }
  );
}
