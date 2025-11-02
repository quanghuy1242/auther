/**
 * Test endpoint to manually trigger a user update
 * This helps test if user.updated webhook events are firing correctly
 * 
 * Usage: POST /api/test/trigger-user-update
 * Body: { userId: "user_123" }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Perform a dummy update to trigger the hook
    // Just update the updatedAt timestamp
    const result = await db
      .update(user)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(user.id, userId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
      user: {
        id: result[0].id,
        email: result[0].email,
        updatedAt: result[0].updatedAt,
      },
    });
  } catch (error) {
    console.error("Test trigger error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
