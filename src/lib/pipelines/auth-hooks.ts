/**
 * Better-Auth Database Hooks with Pipeline Integration
 * 
 * This file creates combined hooks that run both:
 * 1. Pipeline scripts (customizable Lua logic)
 * 2. Webhook emission for external systems
 * 
 * Location: src/lib/pipelines/auth-hooks.ts
 */
import type { BetterAuthOptions } from "better-auth";
import { PipelineIntegrator } from "./integrator";
import { emitWebhookEvent } from "../webhooks/delivery-service";

// =============================================================================
// DATABASE HOOKS (user.create, session.create, etc.)
// =============================================================================
export function createPipelineDatabaseHooks(): BetterAuthOptions["databaseHooks"] {
    // Create pipeline handlers
    const beforeSignupPipeline = PipelineIntegrator.createBlockingHook("before_signup");
    const afterSignupPipeline = PipelineIntegrator.createAsyncHook("after_signup");
    const afterSigninPipeline = PipelineIntegrator.createAsyncHook("after_signin");

    return {
        user: {
            create: {
                // BEFORE: Blocking hook (runs BEFORE user insert)
                async before(user) {
                    const result = await beforeSignupPipeline({
                        email: user.email,
                        name: user.name,
                        request: {
                            ip: undefined,
                            userAgent: undefined,
                        }
                    });

                    if (result.abort) {
                        throw new Error(result.error || "Signup blocked by pipeline policy");
                    }
                    return;
                },

                // AFTER: Async hook (runs AFTER user insert)
                async after(user) {
                    // Fire-and-forget pipeline
                    afterSignupPipeline({
                        user: {
                            id: user.id,
                            email: user.email,
                            name: user.name,
                        },
                        request: {
                            ip: undefined,
                            userAgent: undefined,
                        }
                    });

                    // Emit webhook
                    await emitWebhookEvent(user.id, "user.created", {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        emailVerified: user.emailVerified,
                        createdAt: user.createdAt,
                    }).catch(err => console.error("Failed to emit user.created webhook:", err));
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
                    }).catch(err => console.error("Failed to emit user.updated webhook:", err));
                },
            },
        },
        session: {
            create: {
                async after(session) {
                    // Fire-and-forget after login pipeline
                    afterSigninPipeline({
                        user: {
                            id: session.userId,
                        },
                        session: {
                            id: session.id,
                            userId: session.userId,
                            expiresAt: session.expiresAt,
                        }
                    });

                    // Emit webhook
                    await emitWebhookEvent(session.userId, "session.created", {
                        id: session.id,
                        userId: session.userId,
                        expiresAt: session.expiresAt,
                        ipAddress: session.ipAddress,
                        userAgent: session.userAgent,
                    }).catch(err => console.error("Failed to emit session.created webhook:", err));
                },
            },
        },
        account: {
            create: {
                async after(account) {
                    await emitWebhookEvent(account.userId, "account.linked", {
                        id: account.id,
                        userId: account.userId,
                        providerId: account.providerId,
                        accountId: account.accountId,
                    }).catch(err => console.error("Failed to emit account.linked webhook:", err));
                },
            },
        },
        verification: {
            create: {
                async after() {
                    // Skip - no userId context available
                },
            },
            update: {
                async after() {
                    // Skip - no userId context available
                },
            },
        },
    };
}

// =============================================================================
// AUTH MIDDLEWARE HOOKS
// =============================================================================
// Note: before_signin must be wired via auth middleware because session.create
// does not have access to the user's email. See auth.ts beforeHook.
export const beforeSigninPipeline = PipelineIntegrator.createBlockingHook("before_signin");

