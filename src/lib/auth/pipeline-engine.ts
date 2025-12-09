import { luaEnginePool } from "./lua-engine-pool";
import { pipelineRepository } from "./pipeline-repository";
import { createHash } from "crypto";
import { AsyncLocalStorage } from "async_hooks";

// Storage for async context propagation of tracing parent/depth
const spanContextStorage = new AsyncLocalStorage<{ spanId: string; depth: number }>();

export interface PipelineResult {
    allowed: boolean;
    error?: string;
    data?: Record<string, unknown>; // Accumulated data
}

/**
 * Child span created by helpers.trace() within a script
 */
interface ChildSpan {
    id: string;
    parentSpanId: string;
    traceId: string;
    name: string;
    status: "success" | "error";
    statusMessage?: string;
    startedAt: Date;
    endedAt: Date;
    durationMs: number;
    attributes?: string; // JSON-encoded custom attributes
}

/**
 * Tracing context passed to runScript for custom span creation
 */
interface TracingContext {
    traceId: string;
    parentSpanId: string;
    collectSpan: (span: ChildSpan) => void;
}

export class PipelineEngine {
    // ==========================================================================
    // SAFETY LIMITS (Phase 3 Hardening)
    // ==========================================================================
    private readonly MAX_SCRIPT_SIZE = 5120; // 5KB limit
    private readonly SCRIPT_TIMEOUT_MS = 10000; // 10 seconds (allows for HTTP calls)
    private readonly FETCH_TIMEOUT_MS = 3000; // 3 seconds per fetch
    private readonly FETCH_MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB response limit
    private readonly MAX_CHAIN_DEPTH = 10; // Max layers in DAG
    private readonly MAX_PARALLEL_NODES = 5; // Max nodes per layer
    private readonly MAX_INSTRUCTIONS = 50000; // 50k ops
    private readonly MAX_TRACE_CONTEXT_SIZE = 32768; // 32KB max for trace context/result

    // Custom tracing limits
    private readonly MAX_CUSTOM_SPAN_DEPTH = 2; // Max nesting levels for helpers.trace()
    private readonly MAX_CUSTOM_SPANS_PER_SCRIPT = 100; // Max custom spans per script
    private readonly MAX_SPAN_ATTRIBUTES_SIZE = 1024; // 1KB max for custom span attributes

    // Private IP ranges to block (SSRF protection)
    private readonly BLOCKED_IP_PATTERNS = [
        /^127\./, // Loopback
        /^10\./, // Class A private
        /^192\.168\./, // Class C private
        /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
        /^169\.254\./, // Link-local
        /^0\./, // Current network
        /^::1$/, // IPv6 loopback
        /^fc00:/, // IPv6 unique local
        /^fe80:/, // IPv6 link-local
        /^localhost$/i, // Localhost hostname
    ];

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
            scriptId?: string;  // Optional for child spans (custom traces)
            parentSpanId?: string;  // For custom child spans
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

                // Size Check - fail-open if exceeded
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
                    // FAIL-OPEN: Size limit is a configuration error, not an intentional block
                    console.error(`[PipelineEngine] Script ${scriptId} exceeds size limit (fail-open)`);
                    return {
                        id: scriptId,
                        allowed: true,
                        error: "Script size limit exceeded",
                        _isScriptError: true
                    };
                }


                try {
                    // Create tracing context for helpers.trace() to collect child spans
                    const tracingContext: TracingContext = {
                        traceId,
                        parentSpanId: spanId,
                        collectSpan: (childSpan: ChildSpan) => {
                            // Add child span with layerIndex/parallelIndex inherited from parent
                            spans.push({
                                id: childSpan.id,
                                parentSpanId: childSpan.parentSpanId,
                                name: childSpan.name,
                                layerIndex,
                                parallelIndex,
                                status: childSpan.status,
                                statusMessage: childSpan.statusMessage,
                                startedAt: childSpan.startedAt,
                                endedAt: childSpan.endedAt,
                                durationMs: childSpan.durationMs,
                                attributes: childSpan.attributes,
                            });
                        },
                    };

                    const result = await this.runScript(
                        script.code,
                        { ...currentContext, outputs }, // Inject 'outputs' history
                        tracingContext
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
                    // FAIL-OPEN: Script errors (timeout, crashes, etc.) should NOT block the auth flow.
                    // Only intentional { allowed: false } from script should block.
                    console.error(`[PipelineEngine] Script ${scriptId} errored (fail-open):`, msg);
                    return { id: scriptId, allowed: true, error: msg, _isScriptError: true };
                }

            });

            const layerResults = await Promise.all(layerPromises);

            // 3. Process Layer Results
            const layerOutputData: Record<string, unknown> = {};

            for (const res of layerResults) {
                if (!res) continue; // Skipped script

                // FAIL-OPEN for script errors: If a script crashed/timed out, continue anyway.
                // The error is already logged and traced as "error" status in the span.
                if (res._isScriptError) {
                    console.warn(`[PipelineEngine] Script ${res.id} errored but flow continues (fail-open)`);
                    continue;
                }

                // INTENTIONAL BLOCK: If a script returns { allowed: false }, block the flow.
                // This is the only way a script can block - explicit denial, not crashes.
                if (res.allowed === false) {
                    // === TRACING: Finalize trace as blocked (fire-and-forget) ===
                    const traceEndedAt = new Date();
                    this.saveTrace({
                        traceId,
                        triggerEvent,
                        status: "blocked",
                        statusMessage: res.error || `Blocked by pipeline policy (Node: ${res.id})`,
                        traceStartedAt,
                        traceEndedAt,
                        userId: metadata?.userId,
                        requestIp: metadata?.requestIp,
                        contextSnapshot: this.truncateJson(context, this.MAX_TRACE_CONTEXT_SIZE),
                        resultData: undefined,
                        spans,
                    });
                    return {
                        allowed: false,
                        error: res.error || `Blocked by pipeline policy (Node: ${res.id})`,
                    };
                }


                if ('data' in res && res.data) {
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

        // === TRACING: Finalize trace as success (fire-and-forget) ===
        const traceEndedAt = new Date();
        this.saveTrace({
            traceId,
            triggerEvent,
            status: "success",
            statusMessage: undefined,
            traceStartedAt,
            traceEndedAt,
            userId: metadata?.userId,
            requestIp: metadata?.requestIp,
            contextSnapshot: this.truncateJson(context, this.MAX_TRACE_CONTEXT_SIZE),
            resultData: this.truncateJson(accumulatedData, this.MAX_TRACE_CONTEXT_SIZE),
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
            scriptId?: string;  // Optional for child spans (custom traces)
            parentSpanId?: string;  // For custom child spans
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
                        parentSpanId: span.parentSpanId,  // Include parent span for hierarchy
                        name: span.name,
                        scriptId: span.scriptId ?? "",  // Default to empty for child spans
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
        tracingContext?: TracingContext
    ): Promise<{
        allowed: boolean;
        error?: string;
        data?: Record<string, unknown>;
    }> {
        const pooled = await luaEnginePool.acquire();
        const { engine } = pooled;

        // Trace limits scoped to this script execution
        let customSpanCount = 0;

        // Initial context for this script execution
        const initialContext = {
            spanId: tracingContext?.parentSpanId || "",
            depth: 0,
        };

        return spanContextStorage.run(initialContext, async () => {
            try {
                // --- Sandbox Setup ---

                // 1. Helpers
                const helpers: Record<string, unknown> = {
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
                    secret: async (key: string) => {
                        // Read from pipeline_secrets table (encrypted)
                        const value = await pipelineRepository.getSecretValue(key);
                        return value;
                    },
                    // SAFE FETCH
                    fetch: async (url: string, options: Record<string, unknown>) => {
                        return this.safeFetch(url, options);
                    },
                    getLastAsync: () => this.lastAsyncResult,
                    // REGEX MATCHING - Converts Lua patterns to JS regex
                    matches: (str: string, pattern: string): boolean => {
                        try {
                            // Support both Lua-style patterns and JS regex
                            // Lua patterns: %d (digit), %w (word), %s (space), %. (literal dot)
                            const jsPattern = pattern
                                .replace(/%%/g, "__PERCENT_ESCAPE__")
                                .replace(/%d/g, "\\d")
                                .replace(/%w/g, "\\w")
                                .replace(/%s/g, "\\s")
                                .replace(/%a/g, "[a-zA-Z]")
                                .replace(/%l/g, "[a-z]")
                                .replace(/%u/g, "[A-Z]")
                                .replace(/%./g, (m) => "\\" + m[1]) // Escape other %X as literal
                                .replace(/__PERCENT_ESCAPE__/g, "%");
                            return new RegExp(jsPattern).test(str);
                        } catch {
                            console.warn("[Pipeline] Invalid regex pattern:", pattern);
                            return false;
                        }
                    },
                    // CUSTOM TRACING: helpers.trace(name, [attributes,] fn)
                    trace: (
                        nameOrFn: string | (() => unknown),
                        attrsOrFn?: Record<string, unknown> | (() => unknown),
                        maybeFn?: () => unknown
                    ): unknown => {
                        // Parse overloaded arguments: trace(name, fn) or trace(name, attrs, fn)
                        let name: string;
                        let attributes: Record<string, unknown> | undefined;
                        let fn: () => unknown;

                        if (typeof nameOrFn === "string" && typeof attrsOrFn === "function") {
                            // trace(name, fn)
                            name = nameOrFn;
                            fn = attrsOrFn as () => unknown;
                        } else if (
                            typeof nameOrFn === "string" &&
                            typeof attrsOrFn === "object" &&
                            typeof maybeFn === "function"
                        ) {
                            // trace(name, attrs, fn)
                            name = nameOrFn;
                            attributes = attrsOrFn as Record<string, unknown>;
                            fn = maybeFn;
                        } else {
                            console.warn("[Pipeline] Invalid helpers.trace() arguments, executing without tracing");
                            if (typeof attrsOrFn === "function") {
                                return (attrsOrFn as () => unknown)();
                            }
                            if (typeof maybeFn === "function") {
                                return maybeFn();
                            }
                            return undefined;
                        }

                        // If no tracing context, just execute the function
                        if (!tracingContext) {
                            return fn();
                        }

                        // Get current async context
                        const currentContext = spanContextStorage.getStore();
                        const currentDepth = currentContext?.depth ?? 0;
                        const parentSpanId = currentContext?.spanId ?? tracingContext.parentSpanId ?? "";

                        // Check nesting depth (max 2)
                        if (currentDepth >= this.MAX_CUSTOM_SPAN_DEPTH) {
                            console.warn(
                                `[Pipeline] helpers.trace() max depth (${this.MAX_CUSTOM_SPAN_DEPTH}) exceeded, skipping span: ${name}`
                            );
                            return fn();
                        }

                        // Check span count limit
                        if (customSpanCount >= this.MAX_CUSTOM_SPANS_PER_SCRIPT) {
                            console.warn(
                                `[Pipeline] helpers.trace() max spans (${this.MAX_CUSTOM_SPANS_PER_SCRIPT}) exceeded, skipping span: ${name}`
                            );
                            return fn();
                        }

                        // Validate and truncate attributes if needed
                        let attributesJson: string | undefined;
                        if (attributes) {
                            try {
                                const json = JSON.stringify(attributes);
                                if (json.length > this.MAX_SPAN_ATTRIBUTES_SIZE) {
                                    console.warn(
                                        `[Pipeline] helpers.trace() attributes exceed ${this.MAX_SPAN_ATTRIBUTES_SIZE} bytes, truncating`
                                    );
                                    attributesJson = json.substring(0, this.MAX_SPAN_ATTRIBUTES_SIZE);
                                } else {
                                    attributesJson = json;
                                }
                            } catch {
                                console.warn("[Pipeline] helpers.trace() failed to serialize attributes");
                            }
                        }

                        const childSpanId = crypto.randomUUID();
                        const childSpanStart = new Date();

                        customSpanCount++;

                        const finishSpan = (status: "success" | "error", errorMsg?: string) => {
                            const endedAt = new Date();
                            tracingContext.collectSpan({
                                id: childSpanId,
                                parentSpanId: parentSpanId,
                                traceId: tracingContext.traceId,
                                name,
                                status,
                                statusMessage: errorMsg,
                                startedAt: childSpanStart,
                                endedAt,
                                durationMs: endedAt.getTime() - childSpanStart.getTime(),
                                attributes: attributesJson,
                            });
                        };

                        // Execute within child span context
                        return spanContextStorage.run({ spanId: childSpanId, depth: currentDepth + 1 }, () => {
                            try {
                                const result = fn();

                                // Handle Promise return for async duration
                                if (result instanceof Promise) {
                                    return result
                                        .then((res) => {
                                            finishSpan("success");
                                            return res;
                                        })
                                        .catch((err) => {
                                            const errorMsg = err instanceof Error ? err.message : String(err);
                                            finishSpan("error", errorMsg);
                                            throw err;
                                        });
                                }

                                // Synchronous Success
                                finishSpan("success");
                                return result;
                            } catch (err) {
                                const errorMsg = err instanceof Error ? err.message : String(err);
                                finishSpan("error", errorMsg);
                                throw err;
                            }
                        });
                    },
                };

                engine.global.set("helpers", helpers);
                engine.global.set("context", context);

                // --- SECURITY: Disable dangerous Lua globals ---
                // These could be used for sandbox escapes or unintended side effects
                engine.global.set("os", undefined);
                engine.global.set("io", undefined);
                engine.global.set("package", undefined);
                engine.global.set("require", undefined);
                engine.global.set("loadfile", undefined);
                engine.global.set("dofile", undefined);
                engine.global.set("loadstring", undefined);
                engine.global.set("load", undefined);
                engine.global.set("rawset", undefined);
                engine.global.set("rawget", undefined);
                // Note: Keep 'debug' for instruction limiting via debug.sethook

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
        });
    }

    /**
     * Restricted Fetch Implementation with safety controls:
     * - HTTPS-only (no plain HTTP)
     * - SSRF protection (blocks private IP ranges)
     * - Response size limit (1MB)
     * - Timeout (3 seconds)
     */
    private async safeFetch(url: string, options: Record<string, unknown> = {}) {
        try {
            const parsedUrl = new URL(url);

            // 1. HTTPS-only enforcement
            if (parsedUrl.protocol !== "https:") {
                throw new Error(`Only HTTPS URLs are allowed. Got: ${parsedUrl.protocol}`);
            }

            // 2. SSRF Protection - Block private IP ranges and localhost
            const hostname = parsedUrl.hostname;
            for (const pattern of this.BLOCKED_IP_PATTERNS) {
                if (pattern.test(hostname)) {
                    throw new Error(`Access to private/internal addresses is blocked: ${hostname}`);
                }
            }

            // 3. Execute Fetch with TIMEOUT
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

                // 4. Response size limit check
                const contentLength = response.headers.get("content-length");
                if (contentLength && parseInt(contentLength, 10) > this.FETCH_MAX_RESPONSE_SIZE) {
                    throw new Error(`Response too large: ${contentLength} bytes (max: ${this.FETCH_MAX_RESPONSE_SIZE})`);
                }

                // 5. Read response with size limit
                const text = await response.text();
                if (text.length > this.FETCH_MAX_RESPONSE_SIZE) {
                    throw new Error(`Response too large: ${text.length} bytes (max: ${this.FETCH_MAX_RESPONSE_SIZE})`);
                }

                // 6. Parse as JSON if possible
                let body: unknown;
                try {
                    body = JSON.parse(text);
                } catch {
                    body = { text };
                }

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
                    throw new Error(`Fetch timeout exceeded (${this.FETCH_TIMEOUT_MS}ms)`);
                }
                throw fetchErr;
            }
        } catch (err) {
            console.error("[SafeFetch Error]", err);
            throw new Error("SafeFetch failed: " + (err instanceof Error ? err.message : String(err)));
        }
    }

    private lastAsyncResult: unknown = null;

    /**
     * Truncates JSON data to a maximum size to prevent DB bloat.
     * Large context/result data is truncated with a marker.
     */
    private truncateJson(data: unknown, maxSize: number): string {
        const json = JSON.stringify(data);
        if (json.length <= maxSize) {
            return json;
        }
        // Truncate and add marker
        const truncated = json.slice(0, maxSize - 50);
        return truncated + '..."__truncated":true,"__originalSize":' + json.length + '}';
    }
}

export const pipelineEngine = new PipelineEngine();
