"use server";

import { pipelineRepository } from "@/lib/auth/pipeline-repository";
import { HOOK_REGISTRY, type HookName } from "@/lib/pipelines/definitions";
import { guards } from "@/lib/auth/platform-guard";
import { metricsService } from "@/lib/services";

// =============================================================================
// TYPES
// =============================================================================

export interface GraphNode {
    id: string;
    type: "trigger" | "script";
    position: { x: number; y: number };
    data: {
        label: string;
        scriptId?: string;
        triggerEvent?: HookName;
        executionMode?: "blocking" | "async" | "enrichment";
    };
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface Script {
    id: string;
    name: string;
    code: string;
    config: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Pipeline configuration mapping hook names to script execution layers.
 * Each hook has an array of layers (for parallel execution).
 * Each layer contains script IDs that run in sequence within that layer.
 */
export type PipelineConfig = Partial<Record<HookName, string[][]>>;

// =============================================================================
// GRAPH OPERATIONS
// =============================================================================

/**
 * Get the current graph layout with trigger nodes pre-populated.
 * Returns default layout with all 16 trigger nodes if no graph exists.
 */
export async function getGraph(): Promise<GraphData> {
    await guards.pipelines.view();
    const graph = await pipelineRepository.getGraph();

    // If no graph exists, return default with trigger nodes
    if (!graph) {
        return createDefaultGraph();
    }

    // Parse stored JSON
    const nodes = JSON.parse(graph.nodes) as GraphNode[];
    const edges = JSON.parse(graph.edges) as GraphEdge[];

    // Ensure all trigger nodes exist (in case new hooks were added)
    const existingTriggerIds = new Set(
        nodes.filter((n) => n.type === "trigger").map((n) => n.id)
    );
    const defaultGraph = createDefaultGraph();
    const missingTriggers = defaultGraph.nodes.filter(
        (n) => n.type === "trigger" && !existingTriggerIds.has(n.id)
    );

    return {
        nodes: [...nodes, ...missingTriggers],
        edges,
    };
}

/**
 * Save graph layout and compute execution plans for all triggers.
 */
export async function saveGraph(
    nodes: GraphNode[],
    edges: GraphEdge[]
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.pipelines.update();
        // Save the graph layout
        await pipelineRepository.saveGraph({
            nodes,
            edges,
        });

        // Compute and save execution plans for each trigger
        const triggerNodes = nodes.filter((n) => n.type === "trigger");

        for (const trigger of triggerNodes) {
            const triggerEvent = trigger.data.triggerEvent;
            if (!triggerEvent) continue;

            // Build execution plan using topological sort
            const plan = computeExecutionPlan(trigger.id, nodes, edges);
            if (plan.length > 0) {
                await pipelineRepository.updateExecutionPlan(triggerEvent, plan);
            }
        }

        // Metric: pipeline graph saved
        void metricsService.count("admin.pipeline.graph.save.count", 1);

        return { success: true };
    } catch (error) {
        console.error("Failed to save graph:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// =============================================================================
// SCRIPT OPERATIONS
// =============================================================================

/**
 * Get all pipeline scripts.
 */
export async function getScripts(): Promise<Script[]> {
    await guards.pipelines.view();
    const scripts = await pipelineRepository.listScripts();
    return scripts.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        config: s.config ? JSON.parse(s.config) : null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
    }));
}

/**
 * Create a new pipeline script.
 */
export async function createScript(
    name: string,
    code: string
): Promise<{ success: boolean; script?: Script; error?: string }> {
    try {
        await guards.pipelines.create();
        const script = await pipelineRepository.createScript({ name, code });
        return {
            success: true,
            script: {
                id: script.id,
                name: script.name,
                code: script.code,
                config: script.config ? JSON.parse(script.config) : null,
                createdAt: script.createdAt,
                updatedAt: script.updatedAt,
            },
        };
    } catch (error) {
        console.error("Failed to create script:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Update an existing pipeline script.
 */
export async function updateScript(
    id: string,
    data: { name?: string; code?: string }
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.pipelines.update();
        await pipelineRepository.updateScript(id, data);
        return { success: true };
    } catch (error) {
        console.error("Failed to update script:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Delete a pipeline script.
 */
export async function deleteScript(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.pipelines.delete();
        await pipelineRepository.deleteScript(id);
        return { success: true };
    } catch (error) {
        console.error("Failed to delete script:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// =============================================================================
// PIPELINE CONFIG OPERATIONS (for swimlane editor)
// =============================================================================

/**
 * Get the current pipeline configuration.
 * Returns a map of hook names to their execution layers.
 */
export async function getPipelineConfig(): Promise<PipelineConfig> {
    await guards.pipelines.view();
    const hookNames = Object.keys(HOOK_REGISTRY) as HookName[];
    const config: PipelineConfig = {};

    for (const hookName of hookNames) {
        const layers = await pipelineRepository.getExecutionPlan(hookName);
        if (layers && layers.length > 0) {
            config[hookName] = layers;
        }
    }

    return config;
}

/**
 * Save the pipeline configuration.
 * Updates execution plans for all hooks.
 */
export async function savePipelineConfig(
    config: PipelineConfig
): Promise<{ success: boolean; error?: string }> {
    try {
        await guards.pipelines.update();
        const hookNames = Object.keys(HOOK_REGISTRY) as HookName[];

        for (const hookName of hookNames) {
            const layers = config[hookName] || [];
            await pipelineRepository.updateExecutionPlan(hookName, layers);
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to save pipeline config:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates the default graph with all 16 trigger nodes positioned on the left.
 */
function createDefaultGraph(): GraphData {
    const hookNames = Object.keys(HOOK_REGISTRY) as HookName[];
    const nodes: GraphNode[] = [];

    // Group hooks by category for better visual organization
    const groups = {
        auth: hookNames.filter(
            (h) =>
                h.startsWith("before_sign") ||
                h.startsWith("after_sign") ||
                h === "token_build"
        ),
        apikey: hookNames.filter((h) => h.startsWith("apikey_")),
        client: hookNames.filter((h) => h.startsWith("client_")),
    };

    let yOffset = 0;
    const spacing = 80;
    const groupGap = 40;

    // Add auth hooks
    for (const hookName of groups.auth) {
        const hook = HOOK_REGISTRY[hookName];
        nodes.push({
            id: `trigger_${hookName}`,
            type: "trigger",
            position: { x: 50, y: yOffset },
            data: {
                label: formatHookLabel(hookName),
                triggerEvent: hookName,
                executionMode: hook.type,
            },
        });
        yOffset += spacing;
    }

    yOffset += groupGap;

    // Add API key hooks
    for (const hookName of groups.apikey) {
        const hook = HOOK_REGISTRY[hookName];
        nodes.push({
            id: `trigger_${hookName}`,
            type: "trigger",
            position: { x: 50, y: yOffset },
            data: {
                label: formatHookLabel(hookName),
                triggerEvent: hookName,
                executionMode: hook.type,
            },
        });
        yOffset += spacing;
    }

    yOffset += groupGap;

    // Add client hooks
    for (const hookName of groups.client) {
        const hook = HOOK_REGISTRY[hookName];
        nodes.push({
            id: `trigger_${hookName}`,
            type: "trigger",
            position: { x: 50, y: yOffset },
            data: {
                label: formatHookLabel(hookName),
                triggerEvent: hookName,
                executionMode: hook.type,
            },
        });
        yOffset += spacing;
    }

    return { nodes, edges: [] };
}

/**
 * Format hook name for display (e.g., "before_signup" -> "Before Signup")
 */
function formatHookLabel(hookName: string): string {
    return hookName
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * Compute execution plan for a trigger using topological sort.
 * Returns array of layers, where each layer contains script IDs that can run in parallel.
 */
function computeExecutionPlan(
    triggerId: string,
    nodes: GraphNode[],
    edges: GraphEdge[]
): string[][] {
    // Build adjacency list
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize all script nodes
    const scriptNodes = nodes.filter((n) => n.type === "script");
    for (const node of scriptNodes) {
        adj.set(node.id, []);
        inDegree.set(node.id, 0);
    }

    // Find all nodes reachable from this trigger
    const reachable = new Set<string>();
    const queue = [triggerId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        const outgoing = edges.filter((e) => e.source === current);
        for (const edge of outgoing) {
            if (!reachable.has(edge.target)) {
                reachable.add(edge.target);
                queue.push(edge.target);
            }
        }
    }

    // Build subgraph for reachable script nodes
    const scriptNodeIds = new Set(scriptNodes.map((n) => n.id));
    const reachableScripts = [...reachable].filter((id) =>
        scriptNodeIds.has(id)
    );

    if (reachableScripts.length === 0) {
        return [];
    }

    // Count in-degrees for reachable scripts
    for (const edge of edges) {
        if (reachable.has(edge.source) && reachable.has(edge.target)) {
            if (scriptNodeIds.has(edge.source) && scriptNodeIds.has(edge.target)) {
                adj.get(edge.source)?.push(edge.target);
                inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
            } else if (edge.source === triggerId && scriptNodeIds.has(edge.target)) {
                // Direct edge from trigger - these are layer 0
                // Don't increase in-degree as trigger is not part of script graph
            } else if (scriptNodeIds.has(edge.target)) {
                inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
            }
        }
    }

    // Find nodes directly connected to trigger (layer 0)
    const layer0 = edges
        .filter((e) => e.source === triggerId && scriptNodeIds.has(e.target))
        .map((e) => e.target);

    // Kahn's algorithm for topological sort by layers
    const layers: string[][] = [];
    let currentLayer = layer0.filter((id) => reachableScripts.includes(id));

    while (currentLayer.length > 0) {
        // Get script IDs for this layer
        const layerScriptIds = currentLayer
            .map((nodeId) => {
                const node = scriptNodes.find((n) => n.id === nodeId);
                return node?.data.scriptId;
            })
            .filter((id): id is string => !!id);

        if (layerScriptIds.length > 0) {
            layers.push(layerScriptIds);
        }

        // Find next layer
        const nextLayer: string[] = [];
        for (const nodeId of currentLayer) {
            const neighbors = adj.get(nodeId) || [];
            for (const neighbor of neighbors) {
                const newDegree = (inDegree.get(neighbor) || 1) - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) {
                    nextLayer.push(neighbor);
                }
            }
        }
        currentLayer = nextLayer;
    }

    return layers;
}

// =============================================================================
// SECRETS OPERATIONS
// =============================================================================

export interface SecretInfo {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Get all secrets (without exposing values).
 */
export async function getSecrets(): Promise<SecretInfo[]> {
    await guards.pipelines.view();
    return pipelineRepository.listSecrets();
}

/**
 * Create a new secret.
 */
export async function createSecret(
    name: string,
    value: string,
    description?: string
): Promise<{ success: boolean; secret?: { id: string; name: string }; error?: string }> {
    try {
        // Validate name format (alphanumeric + underscore, uppercase recommended)
        if (!/^[A-Z0-9_]+$/.test(name)) {
            return {
                success: false,
                error: "Secret name must be uppercase alphanumeric with underscores (e.g., STRIPE_KEY)",
            };
        }

        const secret = await pipelineRepository.createSecret({ name, value, description });
        return { success: true, secret };
    } catch (error) {
        console.error("Failed to create secret:", error);
        // Check for unique constraint violation
        if (error instanceof Error && error.message.includes("UNIQUE")) {
            return { success: false, error: "A secret with this name already exists" };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Update an existing secret.
 */
export async function updateSecret(
    id: string,
    data: { value?: string; description?: string }
): Promise<{ success: boolean; error?: string }> {
    try {
        const updated = await pipelineRepository.updateSecret(id, data);
        if (!updated) {
            return { success: false, error: "Secret not found" };
        }

        // Metric: secret rotated (if value changed)
        if (data.value) {
            void metricsService.count("admin.pipeline.secret.rotate.count", 1);
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to update secret:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Delete a secret.
 */
export async function deleteSecret(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await pipelineRepository.deleteSecret(id);
        return { success: true };
    } catch (error) {
        console.error("Failed to delete secret:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// =============================================================================
// TRACE OPERATIONS (for trace viewer)
// =============================================================================

export interface TraceInfo {
    id: string;
    triggerEvent: string;
    status: string;
    statusMessage: string | null;
    startedAt: Date;
    endedAt: Date | null;
    durationMs: number | null;
    userId: string | null;
    requestIp: string | null;
    createdAt: Date;
}

export interface SpanInfo {
    id: string;
    traceId: string;
    parentSpanId: string | null;
    name: string;
    scriptId: string;
    layerIndex: number;
    parallelIndex: number;
    status: string;
    statusMessage: string | null;
    startedAt: Date;
    endedAt: Date | null;
    durationMs: number | null;
    attributes: string | null;
}

export interface TraceFilters {
    triggerEvent?: string;
    status?: string;
    from?: Date;
    to?: Date;
    limit?: number;
}

/**
 * Get traces with optional filters.
 */
export async function getTraces(filters?: TraceFilters): Promise<TraceInfo[]> {
    await guards.pipelines.view();
    const traces = await pipelineRepository.listTraces({
        triggerEvent: filters?.triggerEvent,
        limit: filters?.limit || 50,
    });

    // Apply additional filters that repository doesn't support
    let filtered = traces;

    if (filters?.status) {
        filtered = filtered.filter(t => t.status === filters.status);
    }

    if (filters?.from) {
        filtered = filtered.filter(t => t.startedAt >= filters.from!);
    }

    if (filters?.to) {
        filtered = filtered.filter(t => t.startedAt <= filters.to!);
    }

    return filtered.map(t => ({
        id: t.id,
        triggerEvent: t.triggerEvent,
        status: t.status,
        statusMessage: t.statusMessage,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        durationMs: t.durationMs,
        userId: t.userId,
        requestIp: t.requestIp,
        createdAt: t.createdAt,
    }));
}

/**
 * Get a single trace with its spans.
 */
export async function getTraceWithSpans(traceId: string): Promise<{
    trace: TraceInfo | null;
    spans: SpanInfo[];
}> {
    const result = await pipelineRepository.getTraceWithSpans(traceId);

    if (!result.trace) {
        return { trace: null, spans: [] };
    }

    return {
        trace: {
            id: result.trace.id,
            triggerEvent: result.trace.triggerEvent,
            status: result.trace.status,
            statusMessage: result.trace.statusMessage,
            startedAt: result.trace.startedAt,
            endedAt: result.trace.endedAt,
            durationMs: result.trace.durationMs,
            userId: result.trace.userId,
            requestIp: result.trace.requestIp,
            createdAt: result.trace.createdAt,
        },
        spans: result.spans.map(s => ({
            id: s.id,
            traceId: s.traceId,
            parentSpanId: s.parentSpanId,
            name: s.name,
            scriptId: s.scriptId,
            layerIndex: s.layerIndex,
            parallelIndex: s.parallelIndex,
            status: s.status,
            statusMessage: s.statusMessage,
            startedAt: s.startedAt,
            endedAt: s.endedAt,
            durationMs: s.durationMs,
            attributes: s.attributes,
        })),
    };
}

/**
 * Get list of unique trigger events from traces (for filter dropdown).
 */
export async function getTraceTriggerEvents(): Promise<string[]> {
    const traces = await pipelineRepository.listTraces({ limit: 100 });
    const events = new Set(traces.map(t => t.triggerEvent));
    return Array.from(events).sort();
}
