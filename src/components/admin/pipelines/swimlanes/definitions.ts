// =============================================================================
// SWIMLANE DEFINITIONS
// =============================================================================
// Defines the lifecycle swimlanes and their associated hooks

import { HookName, HOOK_REGISTRY } from "@/lib/pipelines/definitions";

// =============================================================================
// TYPES
// =============================================================================

export type LifecycleType = "signup" | "signin" | "apikey" | "oauth";

export interface ProcessStep {
    id: string;
    label: string;
    icon: string;  // Icon name from your Icon component
    description: string;
}

export interface HookPoint {
    hookName: HookName;
    executionMode: "blocking" | "async" | "enrichment";
    description: string;
}

export interface SwimlaneDef {
    id: LifecycleType;
    title: string;
    description: string;
    color: string;  // Tailwind color class
    /**
     * Flow definition: alternates between ProcessStep and HookPoint
     * The flow shows: [Process] → ⊕Hook → [Process] → ⊕Hook
     */
    flow: (ProcessStep | HookPoint)[];
}

// =============================================================================
// HELPER
// =============================================================================

function hook(hookName: HookName): HookPoint {
    const def = HOOK_REGISTRY[hookName];
    return {
        hookName,
        executionMode: def.type,
        description: def.description,
    };
}

function process(id: string, label: string, icon: string, description: string): ProcessStep {
    return { id, label, icon, description };
}

// =============================================================================
// SWIMLANE DEFINITIONS
// =============================================================================

export const SWIMLANE_DEFINITIONS: SwimlaneDef[] = [
    {
        id: "signup",
        title: "Signup Flow",
        description: "New user registration process",
        color: "emerald",
        flow: [
            process("signup_form", "Form Submit", "person_add", "User submits registration form"),
            hook("before_signup"),
            process("signup_create", "Create User", "database", "System creates user in database"),
            hook("after_signup"),
            process("signup_done", "Complete", "check_circle", "Signup process finished"),
        ],
    },
    {
        id: "signin",
        title: "Signin Flow",
        description: "User authentication process",
        color: "blue",
        flow: [
            process("signin_form", "Login Form", "login", "User enters credentials"),
            hook("before_signin"),
            process("signin_auth", "Authenticate", "shield", "System validates credentials"),
            hook("token_build"),
            process("signin_token", "Token", "key", "Generate session token"),
            hook("after_signin"),
            process("signin_done", "Complete", "check_circle", "User signed in"),
        ],
    },
    {
        id: "apikey",
        title: "API Key Flow",
        description: "API key lifecycle management",
        color: "amber",
        flow: [
            process("apikey_request", "Request", "terminal", "API key operation requested"),
            hook("apikey_before_create"),
            process("apikey_create", "Create Key", "add_circle", "Generate new API key"),
            hook("apikey_after_create"),
            process("apikey_use", "Exchange", "sync", "Use API key for auth"),
            hook("apikey_before_exchange"),
            hook("apikey_after_exchange"),
            process("apikey_revoke", "Revoke", "cancel", "Revoke API key"),
            hook("apikey_before_revoke"),
        ],
    },
    {
        id: "oauth",
        title: "OAuth Client Flow",
        description: "OAuth client and authorization",
        color: "purple",
        flow: [
            process("oauth_register", "Register", "apps", "Client registration request"),
            hook("client_before_register"),
            process("oauth_create", "Create Client", "database", "Create OAuth client"),
            hook("client_after_register"),
            process("oauth_authorize", "Authorize", "verified_user", "User authorization flow"),
            hook("client_before_authorize"),
            hook("client_after_authorize"),
            process("oauth_access", "Access Change", "toggle_on", "Grant/revoke access"),
            hook("client_access_change"),
        ],
    },
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function isHookPoint(item: ProcessStep | HookPoint): item is HookPoint {
    return "hookName" in item;
}

export function isProcessStep(item: ProcessStep | HookPoint): item is ProcessStep {
    return "icon" in item && !("hookName" in item);
}

export function getSwimlaneDef(lifecycle: LifecycleType): SwimlaneDef | undefined {
    return SWIMLANE_DEFINITIONS.find((s) => s.id === lifecycle);
}
