// Pipelines Module
// Provides centralized hook definitions and integration with better-auth

export { HOOK_REGISTRY, type HookName, type HookInput, type HookOutput } from "./definitions";
export { PipelineIntegrator, type PipelineMetadata } from "./integrator";
export { createPipelineDatabaseHooks, beforeSigninPipeline } from "./auth-hooks";
