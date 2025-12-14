// =============================================================================
// DAG CONTEXT FOR PIPELINE SCRIPTS
// =============================================================================
// Provides data structures for understanding script dependencies in the
// pipeline DAG, enabling context-aware autocomplete for context.outputs
// and context.prev.

/**
 * Metadata for a script in the pipeline DAG
 */
export interface ScriptMetadata {
    /** Unique script ID (UUID) */
    id: string;
    /** Human-readable script name */
    name: string;
    /** Source code for return type inference */
    code: string;
    /** 0-based layer index within the hook */
    layerIndex: number;
}

/**
 * DAG context passed to the analyzer and completion providers
 */
export interface DagContext {
    /**
     * Scripts organized by layer (index = layer number)
     * Layer 0 runs first, layer 1 runs after layer 0 completes, etc.
     */
    layers: ScriptMetadata[][];

    /**
     * Current script's layer index
     * -1 if this is a new script not yet placed in the DAG
     */
    currentLayer: number;

    /**
     * Current script's ID, or null if this is a new script
     */
    currentScriptId: string | null;
}

/**
 * Get all scripts that are reachable from the current script's position.
 * Only scripts from previous layers can be accessed via context.outputs.
 *
 * @param dagContext - The DAG context
 * @returns Array of reachable scripts (from all previous layers)
 */
export function getReachableScripts(dagContext: DagContext | undefined): ScriptMetadata[] {
    if (!dagContext || dagContext.currentLayer <= 0) {
        return [];
    }

    const reachable: ScriptMetadata[] = [];

    // Include all scripts from layers before the current one
    for (let i = 0; i < dagContext.currentLayer; i++) {
        const layer = dagContext.layers[i];
        if (layer) {
            reachable.push(...layer);
        }
    }

    return reachable;
}

/**
 * Get scripts from the immediately previous layer (for context.prev)
 *
 * @param dagContext - The DAG context
 * @returns Array of scripts from the previous layer only
 */
export function getPreviousLayerScripts(dagContext: DagContext | undefined): ScriptMetadata[] {
    if (!dagContext || dagContext.currentLayer <= 0) {
        return [];
    }

    const prevLayerIndex = dagContext.currentLayer - 1;
    return dagContext.layers[prevLayerIndex] || [];
}

/**
 * Find a script by its ID in the DAG
 *
 * @param dagContext - The DAG context
 * @param scriptId - The script ID to find
 * @returns The script metadata, or undefined if not found
 */
export function findScriptById(
    dagContext: DagContext | undefined,
    scriptId: string
): ScriptMetadata | undefined {
    if (!dagContext) return undefined;

    for (const layer of dagContext.layers) {
        const script = layer.find((s) => s.id === scriptId);
        if (script) return script;
    }

    return undefined;
}
