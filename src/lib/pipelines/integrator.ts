import { pipelineEngine } from "../auth/pipeline-engine";
import { HOOK_REGISTRY, type HookName, type HookInput } from "./definitions";

// =============================================================================
// PIPELINE INTEGRATOR
// =============================================================================
// This class bridges the PipelineEngine with better-auth hooks.
// It validates input/output schemas and converts results to appropriate formats.

/**
 * Metadata for tracing - optional context about the request
 */
export interface PipelineMetadata {
    userId?: string;
    requestIp?: string;
}

export class PipelineIntegrator {
    /**
     * Creates a BLOCKING hook handler for better-auth.
     * Blocking hooks ABORT the request if pipeline returns allowed: false.
     */
    static createBlockingHook<T extends HookName>(hookName: T) {
        const definition = HOOK_REGISTRY[hookName];
        if (definition.type !== "blocking") {
            throw new Error(`Hook "${hookName}" is not a blocking hook.`);
        }

        return async (context: HookInput<T>, metadata?: PipelineMetadata): Promise<{
            abort: boolean;
            error?: string
        }> => {
            try {
                // Validate input against schema
                const validatedInput = definition.input.parse(context);

                // Execute pipeline with metadata for tracing
                const result = await pipelineEngine.executeTrigger(hookName, validatedInput, metadata);

                // Validate output (optional, for debugging)
                const validatedOutput = definition.output.safeParse(result);
                if (!validatedOutput.success) {
                    console.warn(`[Pipeline] Output validation warning for ${hookName}:`, validatedOutput.error);
                }

                // Convert to better-auth format
                if (result.allowed === false) {
                    return { abort: true, error: result.error || "Blocked by pipeline policy" };
                }
                return { abort: false };

            } catch (err) {
                console.error(`[Pipeline Integrator] Error in ${hookName}:`, err);
                // Fail-open: Don't block user on engine errors
                return { abort: false };
            }
        };
    }

    /**
     * Creates an ASYNC hook handler for better-auth.
     * Async hooks run in background and never block the main request.
     */
    static createAsyncHook<T extends HookName>(hookName: T) {
        const definition = HOOK_REGISTRY[hookName];
        if (definition.type !== "async") {
            throw new Error(`Hook "${hookName}" is not an async hook.`);
        }

        return async (context: HookInput<T>, metadata?: PipelineMetadata): Promise<void> => {
            // Fire-and-forget: Don't await the pipeline
            pipelineEngine.executeTrigger(hookName, definition.input.parse(context), metadata)
                .catch(err => console.error(`[Pipeline Async] Error in ${hookName}:`, err));
        };
    }

    /**
     * Creates an ENRICHMENT hook handler for better-auth.
     * Enrichment hooks return data to be merged into the target (e.g., JWT claims).
     */
    static createEnrichmentHook<T extends HookName>(hookName: T) {
        const definition = HOOK_REGISTRY[hookName];
        if (definition.type !== "enrichment") {
            throw new Error(`Hook "${hookName}" is not an enrichment hook.`);
        }

        return async (context: HookInput<T>, metadata?: PipelineMetadata): Promise<Record<string, unknown>> => {
            try {
                const validatedInput = definition.input.parse(context);
                const result = await pipelineEngine.executeTrigger(hookName, validatedInput, metadata);

                if (result.allowed === false) {
                    throw new Error(result.error || "Enrichment blocked by pipeline");
                }

                // Return the data object to be merged
                return result.data || {};

            } catch (err) {
                console.error(`[Pipeline Enrichment] Error in ${hookName}:`, err);
                // Fail-open: Return empty object on errors
                return {};
            }
        };
    }
}

