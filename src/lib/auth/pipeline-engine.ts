import { luaEnginePool } from "./lua-engine-pool";
import { pipelineRepository } from "./pipeline-repository";
import { createHash } from "crypto";

export interface PipelineResult {
    allowed: boolean;
    error?: string;
    data?: Record<string, unknown>; // Accumulated data
}

export class PipelineEngine {
    // ==========================================================================
    // SAFETY LIMITS (Phase 3 Hardening)
    // ==========================================================================
    private readonly MAX_SCRIPT_SIZE = 5120; // 5KB limit
    private readonly SCRIPT_TIMEOUT_MS = 1000; // 1 second
    private readonly FETCH_TIMEOUT_MS = 3000; // 3 seconds
    private readonly MAX_CHAIN_DEPTH = 10; // Max layers in DAG
    private readonly MAX_PARALLEL_NODES = 5; // Max nodes per layer
    private readonly MAX_INSTRUCTIONS = 50000; // 50k ops

    // Configuration for Safe Fetch (should be moved to DB/Env later)
    private readonly ALLOWED_DOMAINS = ["api.stripe.com", "api.internal.co", "mock-api.com"];
    private readonly SECRETS: Record<string, string> = {
        STRIPE_KEY: "sk_test_mock_stripe_key",
        INTERNAL_API_KEY: "mock_internal_key",
    };

    /**
     * Executes the pipeline for a specific trigger event.
     * @param triggerEvent The event name (e.g., 'before_signup')
     * @param context The initial context data provided by the hook
     * @returns PipelineResult indicating success/failure and any returned data.
     */
    async executeTrigger(
        triggerEvent: string,
        context: Record<string, unknown>,
        metadata?: { userId?: string; requestIp?: string }
    ): Promise<PipelineResult> {
        // === TRACING: Start trace ===
        const traceId = crypto.randomUUID();
        const traceStartedAt = new Date();

        // 1. Get Execution Plan (DAG Layers: string[][])
        const plan = await pipelineRepository.getExecutionPlan(triggerEvent);

        // If no plan exists, we default to ALLOW (no trace needed)
        if (!plan || plan.length === 0) {
            return { allowed: true };
        }

        // SAFETY: Validate Chain Depth
        if (plan.length > this.MAX_CHAIN_DEPTH) {
            return {
                allowed: false,
                error: `Pipeline exceeds max chain depth(${this.MAX_CHAIN_DEPTH} layers allowed, got ${plan.length})`
            };
        }

        // SAFETY: Validate Parallel Node Count
        for (let i = 0; i < plan.length; i++) {
            if (plan[i].length > this.MAX_PARALLEL_NODES) {
                return {
                    allowed: false,
                    error: `Layer ${i + 1} exceeds max parallel nodes(${this.MAX_PARALLEL_NODES} allowed, got ${plan[i].length})`
                };
            }
        }

        let currentContext = { ...context };
        // Validated: accumulatedData merges everything for final return
        const accumulatedData: Record<string, unknown> = {};

        // Output history for scripts to access specific node results: context.outputs['node_id']
        const outputs: Record<string, Record<string, unknown>> = {};

        // === TRACING: Collect spans ===
        const spans: Array<{
            id: string;
            scriptId: string;
            name: string;
            layerIndex: number;
            parallelIndex: number;
            status: string;
            statusMessage?: string;
            startedAt: Date;
            endedAt?: Date;
            durationMs?: number;
            attributes?: string;
        }> = [];

        // 2. Iterate through LAYERS (Sequential Layers)
        let layerIndex = 0;
        for (const layer of plan) {
            // LAYER EXECUTION: Run all scripts in this layer in PARALLEL
            const layerPromises = layer.map(async (scriptId, parallelIndex) => {
                const spanId = crypto.randomUUID();
                const spanStartedAt = new Date();

                const script = await pipelineRepository.getScript(scriptId);
                if (!script) {
                    console.warn(
                        `PipelineEngine: Script ${scriptId} in plan for ${triggerEvent} not found. Skipping.`
                    );
                    spans.push({
                        id: spanId,
                        scriptId,
                        name: "Unknown",
                        layerIndex,
                        parallelIndex,
                        status: "skipped",
                        statusMessage: "Script not found",
                        startedAt: spanStartedAt,
                        endedAt: new Date(),
                        durationMs: Date.now() - spanStartedAt.getTime(),
                    });
                    return null;
                }

                // Size Check
                if (script.code.length > this.MAX_SCRIPT_SIZE) {
                    const endedAt = new Date();
                    spans.push({
                        id: spanId,
                        scriptId,
                        name: script.name,
                        layerIndex,
                        parallelIndex,
                        status: "error",
                        statusMessage: "Script size limit exceeded",
                        startedAt: spanStartedAt,
                        endedAt,
                        durationMs: endedAt.getTime() - spanStartedAt.getTime(),
                    });
                    return {
                        id: scriptId,
                        allowed: false,
                        error: "Script size limit exceeded"
                    };
                }

                try {
                    const result = await this.runScript(
                        script.code,
                        { ...currentContext, outputs }, // Inject 'outputs' history
                        accumulatedData
                    );
                    const endedAt = new Date();
                    spans.push({
                        id: spanId,
                        scriptId,
                        name: script.name,
                        layerIndex,
                        parallelIndex,
                        status: result.allowed === false ? "blocked" : "success",
                        statusMessage: result.error,
                        startedAt: spanStartedAt,
                        endedAt,
                        durationMs: endedAt.getTime() - spanStartedAt.getTime(),
                        attributes: JSON.stringify({ output: result.data }),
                    });
                    return { id: scriptId, ...result };
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    const endedAt = new Date();
                    spans.push({
                        id: spanId,
                        scriptId,
                        name: script.name,
                        layerIndex,
                        parallelIndex,
                        status: "error",
                        statusMessage: msg,
                        startedAt: spanStartedAt,
                        endedAt,
                        durationMs: endedAt.getTime() - spanStartedAt.getTime(),
                    });
                    return { id: scriptId, allowed: false, error: msg };
                }
            });

            const layerResults = await Promise.all(layerPromises);

            // 3. Process Layer Results
            const layerOutputData: Record<string, unknown> = {};

            for (const res of layerResults) {
                if (!res) continue; // Skipped script

                // FAIL SECURE: If ANY script in the layer denies, the whole pipeline stops.
                // (In parallel execution, we wait for all to finish, then check blocking)
                if (res.allowed === false) {
                    // === TRACING: Finalize trace as blocked ===
                    const traceEndedAt = new Date();
                    await this.saveTrace({
                        traceId,
                        triggerEvent,
                        status: "blocked",
                        statusMessage: res.error || `Blocked by pipeline policy (Node: ${res.id})`,
                        traceStartedAt,
                        traceEndedAt,
                        userId: metadata?.userId,
                        requestIp: metadata?.requestIp,
                        contextSnapshot: JSON.stringify(context),
                        resultData: undefined,
                        spans,
                    });
                    return {
                        allowed: false,
                        error: res.error || `Blocked by pipeline policy (Node: ${res.id})`,
                    };
                }

                if (res.data) {
                    // Store for specific node access
                    outputs[res.id] = res.data;
                    // Merge into layer output for next layer's 'prev'
                    Object.assign(layerOutputData, res.data);
                    Object.assign(accumulatedData, res.data);
                }
            }

            // 4. Update Context for NEXT layer
            // 'prev' now contains the merged results of the CURRENT layer (Fan-in)
            currentContext = {
                ...currentContext,
                prev: layerOutputData,
            };
            layerIndex++;
        }

        // === TRACING: Finalize trace as success ===
        const traceEndedAt = new Date();
        await this.saveTrace({
            traceId,
            triggerEvent,
            status: "success",
            statusMessage: undefined,
            traceStartedAt,
            traceEndedAt,
            userId: metadata?.userId,
            requestIp: metadata?.requestIp,
            contextSnapshot: JSON.stringify(context),
            resultData: JSON.stringify(accumulatedData),
            spans,
        });

        return { allowed: true, data: accumulatedData };
    }

    /**
     * Saves trace and spans to database (fire-and-forget, non-blocking).
     */
    private async saveTrace(params: {
        traceId: string;
        triggerEvent: string;
        status: string;
        statusMessage?: string;
        traceStartedAt: Date;
        traceEndedAt: Date;
        userId?: string;
        requestIp?: string;
        contextSnapshot?: string;
        resultData?: string;
        spans: Array<{
            id: string;
            scriptId: string;
            name: string;
            layerIndex: number;
            parallelIndex: number;
            status: string;
            statusMessage?: string;
            startedAt: Date;
            endedAt?: Date;
            durationMs?: number;
            attributes?: string;
        }>;
    }): Promise<void> {
        try {
            // Insert trace via repository
            await pipelineRepository.createTrace({
                id: params.traceId,
                triggerEvent: params.triggerEvent,
                status: params.status,
                statusMessage: params.statusMessage,
                startedAt: params.traceStartedAt,
                endedAt: params.traceEndedAt,
                durationMs: params.traceEndedAt.getTime() - params.traceStartedAt.getTime(),
                userId: params.userId,
                requestIp: params.requestIp,
                contextSnapshot: params.contextSnapshot,
                resultData: params.resultData,
            });

            // Insert spans via repository
            if (params.spans.length > 0) {
                await pipelineRepository.createSpans(
                    params.spans.map((span) => ({
                        id: span.id,
                        traceId: params.traceId,
                        name: span.name,
                        scriptId: span.scriptId,
                        layerIndex: span.layerIndex,
                        parallelIndex: span.parallelIndex,
                        status: span.status,
                        statusMessage: span.statusMessage,
                        startedAt: span.startedAt,
                        endedAt: span.endedAt,
                        durationMs: span.durationMs,
                        attributes: span.attributes,
                    }))
                );
            }
        } catch (err) {
            // Non-blocking: log error but don't fail the pipeline
            console.error("[PipelineEngine] Failed to save trace:", err);
        }
    }
    private async runScript(
        code: string,
        context: Record<string, unknown>,
        accumulatedData: Record<string, unknown>
    ): Promise<{
        allowed: boolean;
        error?: string;
        data?: Record<string, unknown>;
    }> {
        const pooled = await luaEnginePool.acquire();
        const { engine } = pooled;

        try {
            // --- Sandbox Setup ---

            // 1. Helpers
            const helpers = {
                log: (msg: unknown) => console.log("[Pipeline Log]:", msg),
                now: () => Date.now(),
                hash: (text: string, algorithm: "sha256" | "md5" = "sha256") => {
                    return createHash(algorithm).update(text).digest("hex");
                },
                env: (key: string) => {
                    const ALLOWED_ENV = ["NODE_ENV", "NEXT_PUBLIC_APP_URL"];
                    if (ALLOWED_ENV.includes(key)) return process.env[key];
                    return null;
                },
                queueWebhook: (event: string, payload: unknown) => {
                    console.log(`[Pipeline Webhook Queued] ${event}: `, payload);
                },
                secret: (key: string) => {
                    return this.SECRETS[key] || null;
                },
                // SAFE FETCH
                fetch: async (url: string, options: Record<string, unknown>) => {
                    return this.safeFetch(url, options);
                },
                getLastAsync: () => this.lastAsyncResult
            };


            engine.global.set("helpers", helpers);
            engine.global.set("context", context);

            // --- Execution ---
            // Inject instruction limit (debug hook) - 50k ops
            // Hook fires every 100 instructions, so we count by 100
            const instructionLimit = `
                local __instruction_count = 0
                local __MAX_INSTRUCTIONS = ${this.MAX_INSTRUCTIONS}
                local __HOOK_INTERVAL = 100
debug.sethook(function ()
                    __instruction_count = __instruction_count + __HOOK_INTERVAL
                    if __instruction_count > __MAX_INSTRUCTIONS then
error("Script exceeded instruction limit ("..__MAX_INSTRUCTIONS.. " operations)")
end
end, "", __HOOK_INTERVAL)
`;

            // Inject 'await' helper as Lua function that yields
            const luaPrelude = `
function await(p)
coroutine.yield(p)
return helpers.getLastAsync()
end
            `;
            const fullCode = instructionLimit + "\n" + luaPrelude + "\n" + code;

            const result = await Promise.race([
                engine.doString(fullCode),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error("Script execution timeout")),
                        this.SCRIPT_TIMEOUT_MS
                    )
                ),
            ]);

            if (!result) {
                console.warn("Pipeline script returned nil. Defaulting to allowed.");
                return { allowed: true };
            }

            const allowed = result.allowed !== false;
            const error = result.error;
            const data = result.data;

            return { allowed, error, data };
        } finally {
            engine.global.set("helpers", undefined);
            engine.global.set("context", undefined);
            luaEnginePool.release(pooled);
        }
    }

    /**
     * Restricted Fetch Implementation with safety controls
     */
    private async safeFetch(url: string, options: Record<string, unknown> = {}) {
        try {
            const parsedUrl = new URL(url);

            // 1. Domain Whitelist Check
            if (!this.ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
                throw new Error(`Domain ${parsedUrl.hostname} is not whitelisted.`);
            }

            // 2. Secret Injection in Headers
            // (Lua passes reference like {{STRIPE_KEY}}, implementation handles logic if needed,
            // but here we allow Lua to call helpers.secret() directly to construct headers.
            // If we wanted automatic injection for body, we'd do it here.)

            // 3. Rate Limiting (Simple Placeholder)
            // TODO: Add Redis-based rate limiting here

            // 4. Execute Fetch with TIMEOUT (3 seconds)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(url, {
                    method: (options.method as string) || "GET",
                    headers: (options.headers as HeadersInit) || {},
                    body: options.body as BodyInit | null | undefined,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // 5. Response Sanitization
                const body = await response.json().catch(() => ({ text: "Non-JSON response" }));

                const result = {
                    status: response.status,
                    ok: response.ok,
                    body: body
                };
                this.lastAsyncResult = result; // Side-channel for Lua await
                return result;
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
                    throw new Error(`Fetch timeout exceeded(${this.FETCH_TIMEOUT_MS}ms)`);
                }
                throw fetchErr;
            }
        } catch (err) {
            console.error("SafeFetch Error:", err);
            throw new Error("SafeFetch failed: " + (err instanceof Error ? err.message : String(err)));
        }
    }

    private lastAsyncResult: unknown = null;
}

export const pipelineEngine = new PipelineEngine();
