import { LuaFactory } from "wasmoon";
import { getWasmPath } from "@/lib/utils/wasm-path";

let factory: LuaFactory | null = null;

/**
 * Validates Lua script syntax without executing it.
 * Returns { valid: true } or { valid: false, error: string }.
 * 
 * This uses the Lua parser to check for syntax errors.
 */
export async function validateLuaSyntax(script: string): Promise<{ valid: true } | { valid: false; error: string }> {
    // Empty script is valid (means no policy)
    if (!script.trim()) {
        return { valid: true };
    }

    try {
        // Lazy init factory with explicit WASM path
        if (!factory) {
            factory = new LuaFactory(getWasmPath());
        }

        // Create a temporary engine for validation
        const engine = await factory.createEngine();

        try {
            // Use loadString to parse without executing
            // loadString compiles but doesn't run, giving us syntax validation
            await engine.doString(`
        local fn, err = load(${JSON.stringify(script)})
        if err then error(err) end
      `);

            return { valid: true };
        } finally {
            engine.global.close();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Extract meaningful error message
        const match = message.match(/\[string ".*?"\]:(\d+):\s*(.+)/);
        if (match) {
            return {
                valid: false,
                error: `Line ${match[1]}: ${match[2]}`,
            };
        }

        return {
            valid: false,
            error: message,
        };
    }
}

/**
 * Quick check for common Lua policy patterns.
 * Returns suggestions for improvement.
 */
export function analyzeLuaPolicy(script: string): {
    warnings: string[];
    suggestions: string[];
} {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!script.trim()) {
        return { warnings, suggestions };
    }

    // Check for missing return statement
    if (!script.includes("return")) {
        warnings.push("Policy does not contain a 'return' statement. It will always return false.");
    }

    // Check for context usage
    if (!script.includes("context")) {
        suggestions.push("Policy does not use 'context'. Consider using context.resource or context.user for ABAC.");
    }

    // Check for dangerous operations (informational)
    if (script.includes("os.") || script.includes("io.") || script.includes("require")) {
        warnings.push("Policy contains potentially dangerous operations (os/io/require). These are sandboxed and will fail.");
    }

    // Check for infinite loop patterns
    if (script.includes("while true") || /while\s+1\s+do/.test(script)) {
        warnings.push("Policy contains a potentially infinite loop. It will be terminated after 1 second.");
    }

    return { warnings, suggestions };
}

/**
 * Test a Lua policy with sample context.
 * Returns the evaluation result along with execution time.
 */
export async function testLuaPolicy(
    script: string,
    context: Record<string, unknown>
): Promise<{
    result: boolean;
    executionTimeMs: number;
    error?: string;
}> {
    // First validate syntax
    const validation = await validateLuaSyntax(script);
    if (!validation.valid) {
        return {
            result: false,
            executionTimeMs: 0,
            error: `Syntax error: ${validation.error}`,
        };
    }

    // Import dynamically to avoid circular dependencies
    const { LuaPolicyEngine } = await import("./policy-engine");
    const engine = new LuaPolicyEngine();

    const startTime = performance.now();

    try {
        const result = await engine.execute(script, context, true);
        const executionTimeMs = performance.now() - startTime;

        return {
            result,
            executionTimeMs: Math.round(executionTimeMs * 100) / 100,
        };
    } catch (error) {
        const executionTimeMs = performance.now() - startTime;
        return {
            result: false,
            executionTimeMs: Math.round(executionTimeMs * 100) / 100,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
