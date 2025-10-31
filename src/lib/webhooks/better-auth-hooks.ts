/**
 * Better Auth database hooks to emit webhook events
 */
import type { BetterAuthOptions } from "better-auth";
import { emitWebhookEvent } from "./delivery-service";

export function createBetterAuthWebhookHooks(): BetterAuthOptions["databaseHooks"] {
  return {
    user: {
      create: {
        async after(user) {
          await emitWebhookEvent(user.id, "user.created", {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt,
          });
        },
      },
      update: {
        async after(user) {
          await emitWebhookEvent(user.id, "user.updated", {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            updatedAt: user.updatedAt,
          });
        },
      },
      // Note: Better Auth doesn't have user.delete hook, would need to implement manually
    },
    session: {
      create: {
        async after(session) {
          await emitWebhookEvent(session.userId, "session.created", {
            id: session.id,
            userId: session.userId,
            expiresAt: session.expiresAt,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          });
        },
      },
      // Sessions don't have update hook typically
    },
    account: {
      create: {
        async after(account) {
          // This is when account is linked
          await emitWebhookEvent(account.userId, "account.linked", {
            id: account.id,
            userId: account.userId,
            providerId: account.providerId,
            accountId: account.accountId,
          });
        },
      },
      // Note: Account unlinking would need manual implementation
    },
    verification: {
      create: {
        async after(verification) {
          // We don't have userId in verification, so skip this event
          // or use identifier (email) to lookup user
          console.log("Verification sent:", verification.identifier);
        },
      },
      update: {
        async after(verification) {
          // When verification is completed
          if (verification.value) {
            console.log("Verification completed:", verification.identifier);
            // We don't have userId in verification, so skip this event
          }
        },
      },
    },
  };
}
