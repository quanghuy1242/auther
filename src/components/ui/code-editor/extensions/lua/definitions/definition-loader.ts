// =============================================================================
// DEFINITION LOADER
// =============================================================================
// Loads and provides access to Lua and sandbox definitions from JSON files.
// Similar to EmmyLua's definition system.
//
// IMPORTANT: This module defines two categories of types:
//
// 1. JSON SCHEMA TYPES (below)
//    - ParamDefinition, FunctionDefinition, PropertyDefinition, etc.
//    - These describe the SHAPE of JSON definition files (lua-builtins.json,
//      sandbox-definitions.json).
//    - Used for parsing/loading definitions from disk.
//
// 2. RUNTIME TYPES (in analysis/type-system.ts)
//    - LuaType, LuaFunctionType, LuaTableType, etc.
//    - These are the actual type representations used during analysis.
//    - Used for type inference, type checking, and completion.
//
// To convert between them, use:
//    import { definitionToType, parseTypeString } from '../analysis/type-system';
//
// =============================================================================

import luaBuiltinsJson from "./lua-builtins.json";
import sandboxDefinitionsJson from "./sandbox-definitions.json";

// =============================================================================
// JSON SCHEMA TYPES
// =============================================================================
// These interfaces describe the structure of definition JSON files.
// They are NOT the same as LuaType used for runtime type inference.

export interface ParamDefinition {
    name: string;
    type: string;
    description?: string;
    optional?: boolean;
    vararg?: boolean;
}

export interface ReturnDefinition {
    type: string;
    description?: string;
}

export interface FunctionDefinition {
    kind: "function";
    signature: string;
    description: string;
    params?: ParamDefinition[];
    returns?: ReturnDefinition;
    async?: boolean;
    example?: string;
    internal?: boolean;
    overloads?: Array<{
        params: ParamDefinition[];
        returns: ReturnDefinition;
    }>;
}

export interface PropertyDefinition {
    kind: "property";
    type: string;
    description?: string;
    optional?: boolean;
}

export interface TableDefinition {
    kind: "table";
    description?: string;
    fields?: Record<string, FieldDefinition>;
}

export type FieldDefinition = FunctionDefinition | PropertyDefinition | TableDefinition;

export interface GlobalDefinition {
    kind: "function" | "table" | "property";
    signature?: string;
    description?: string;
    type?: string;
    params?: ParamDefinition[];
    returns?: ReturnDefinition;
    fields?: Record<string, FieldDefinition>;
}

export interface LibraryDefinition {
    kind: "table";
    description?: string;
    fields: Record<string, FieldDefinition>;
}

export interface DisabledGlobalInfo {
    message: string;
}

export interface TypeDefinition {
    kind: "table";
    description?: string;
    fields: Record<string, { type: string; description?: string; optional?: boolean }>;
}

export interface HookVariant {
    description?: string;
    fields: Record<string, PropertyDefinition>;
}

export interface ContextDefinition {
    kind: "table";
    description: string;
    fields: Record<string, FieldDefinition>;
    hookVariants: Record<string, HookVariant>;
}

export interface ReturnTypeInfo {
    description: string;
    requiredFields: string[];
    optionalFields: string[];
    example: string;
}

// =============================================================================
// METADATA TYPES (for data-driven handlers)
// =============================================================================

export type SemanticType = 'namespace' | 'function' | 'variable' | 'property';

export interface SandboxItemMetadata {
    semanticType: SemanticType;
    isBuiltin: boolean;
    isReadonly?: boolean;
    builtinUri?: string;
    hasHookVariants?: boolean;
}

export interface SandboxItemDefinition {
    kind: 'table' | 'function' | 'property';
    semanticType?: SemanticType;
    isBuiltin?: boolean;
    isReadonly?: boolean;
    builtinUri?: string;
    hasHookVariants?: boolean;
    description?: string;
    fields?: Record<string, FieldDefinition>;
    signature?: string;
    params?: ParamDefinition[];
    returns?: ReturnDefinition;
    hookVariants?: Record<string, HookVariant>;
}

// =============================================================================
// DEFINITION LOADER
// =============================================================================

/**
 * Loads and provides access to Lua definitions.
 * Similar to EmmyLua's definition index.
 */
export class DefinitionLoader {
    private builtins: typeof luaBuiltinsJson;
    private sandbox: typeof sandboxDefinitionsJson;

    constructor() {
        this.builtins = luaBuiltinsJson;
        this.sandbox = sandboxDefinitionsJson;
    }

    // ---------------------------------------------------------------------------
    // Global Access
    // ---------------------------------------------------------------------------

    /**
     * Get a global definition by name
     */
    getGlobal(name: string): GlobalDefinition | undefined {
        const globals = this.builtins.globals as Record<string, GlobalDefinition>;
        return globals[name];
    }

    /**
     * Get all global names
     */
    getGlobalNames(): string[] {
        return Object.keys(this.builtins.globals);
    }

    /**
     * Get a library definition by name (string, table, math)
     */
    getLibrary(name: string): LibraryDefinition | undefined {
        const libs = this.builtins.libraries as Record<string, LibraryDefinition>;
        return libs[name];
    }

    /**
     * Get all library names
     */
    getLibraryNames(): string[] {
        return Object.keys(this.builtins.libraries);
    }

    /**
     * Get a library method definition
     */
    getLibraryMethod(libName: string, methodName: string): FieldDefinition | undefined {
        const lib = this.getLibrary(libName);
        return lib?.fields?.[methodName];
    }

    /**
     * Get all method names for a library
     */
    getLibraryMethodNames(libName: string): string[] {
        const lib = this.getLibrary(libName);
        return lib?.fields ? Object.keys(lib.fields) : [];
    }

    /**
     * Get all Lua keywords
     */
    getKeywords(): string[] {
        return this.builtins.keywords;
    }

    // ---------------------------------------------------------------------------
    // Sandbox Access
    // ---------------------------------------------------------------------------

    /**
     * Get the helpers table definition
     */
    getHelpers(): TableDefinition {
        return this.sandbox.sandbox.helpers as TableDefinition;
    }

    /**
     * Get a specific helper function definition
     */
    getHelper(name: string): FunctionDefinition | undefined {
        const helpers = this.sandbox.sandbox.helpers.fields as Record<string, FunctionDefinition>;
        return helpers[name];
    }

    /**
     * Get all helper function names
     */
    getHelperNames(): string[] {
        return Object.keys(this.sandbox.sandbox.helpers.fields);
    }

    /**
     * Get the context table definition
     */
    getContext(): ContextDefinition {
        return this.sandbox.sandbox.context as ContextDefinition;
    }

    /**
     * Get context fields for a specific hook
     */
    getContextFieldsForHook(hookName?: string): Record<string, FieldDefinition> {
        const context = this.sandbox.sandbox.context as ContextDefinition;
        const baseFields = { ...context.fields };

        if (hookName) {
            const variant = context.hookVariants[hookName];
            if (variant?.fields) {
                Object.assign(baseFields, variant.fields);
            }
        } else {
            // Fallback: merge all variants to show all possible fields
            for (const variant of Object.values(context.hookVariants)) {
                if (variant.fields) {
                    Object.assign(baseFields, variant.fields);
                }
            }
        }

        return baseFields;
    }

    /**
     * Get all hook names with context variants
     */
    getHookNames(): string[] {
        const context = this.sandbox.sandbox.context as ContextDefinition;
        return Object.keys(context.hookVariants);
    }

    /**
     * Get the await function definition
     */
    getAwait(): FunctionDefinition {
        return this.sandbox.sandbox.await as FunctionDefinition;
    }

    // ---------------------------------------------------------------------------
    // Data-Driven Accessors (for removing hardcoded checks in handlers)
    // ---------------------------------------------------------------------------

    /**
     * Get a sandbox item by name (helpers, context, await)
     */
    getSandboxItem(name: string): SandboxItemDefinition | undefined {
        const sandbox = this.sandbox.sandbox as Record<string, SandboxItemDefinition>;
        return sandbox[name];
    }

    /**
     * Get all sandbox item names
     */
    getSandboxItemNames(): string[] {
        return Object.keys(this.sandbox.sandbox);
    }

    /**
     * Get metadata for a sandbox item (for semantic tokens, hover, etc.)
     */
    getSandboxItemMetadata(name: string): SandboxItemMetadata | undefined {
        const item = this.getSandboxItem(name);
        if (!item || !item.semanticType || !item.isBuiltin) return undefined;

        return {
            semanticType: item.semanticType,
            isBuiltin: item.isBuiltin,
            isReadonly: item.isReadonly,
            builtinUri: item.builtinUri,
            hasHookVariants: item.hasHookVariants,
        };
    }

    /**
     * Check if an identifier is a namespace (sandbox item or library)
     */
    isNamespace(name: string): boolean {
        // Check sandbox items
        const sandboxMeta = this.getSandboxItemMetadata(name);
        if (sandboxMeta?.semanticType === 'namespace') return true;

        // Check libraries
        const lib = this.getLibrary(name) as { semanticType?: string } | undefined;
        if (lib?.semanticType === 'namespace') return true;

        return false;
    }

    /**
     * Get the builtin URI for a sandbox item
     */
    getBuiltinUri(name: string): string | undefined {
        const item = this.getSandboxItem(name);
        return item?.builtinUri;
    }

    /**
     * Check if a sandbox item has hook variants (like context)
     */
    hasHookVariants(name: string): boolean {
        const item = this.getSandboxItem(name);
        return item?.hasHookVariants === true;
    }

    /**
     * Get the member definition for a namespace.member access
     * Enhanced to also check hook-variant fields for items like context
     */
    getMemberDefinition(namespace: string, member: string, hookName?: string): FieldDefinition | undefined {
        // Check sandbox items first
        const sandboxItem = this.getSandboxItem(namespace);
        if (sandboxItem) {
            // Check base fields first
            if (sandboxItem.fields?.[member]) {
                return sandboxItem.fields[member];
            }

            // Check hook-variant fields for items like context
            if (this.hasHookVariants(namespace)) {
                const contextFields = this.getContextFieldsForHook(hookName);
                if (contextFields[member]) {
                    return contextFields[member];
                }
            }
        }

        // Check libraries
        return this.getLibraryMethod(namespace, member);
    }

    /**
     * Get all member names for a namespace
     */
    getMemberNames(namespace: string): string[] {
        // Check sandbox items first
        const sandboxItem = this.getSandboxItem(namespace);
        if (sandboxItem?.fields) {
            return Object.keys(sandboxItem.fields);
        }

        // Check libraries
        return this.getLibraryMethodNames(namespace);
    }

    // ---------------------------------------------------------------------------
    // Disabled Globals
    // ---------------------------------------------------------------------------


    /**
     * Check if a global is disabled
     */
    isDisabled(name: string): boolean {
        const disabled = this.sandbox.disabledGlobals as Record<string, DisabledGlobalInfo>;
        return name in disabled;
    }

    /**
     * Get disabled global message
     */
    getDisabledMessage(name: string): string | undefined {
        const disabled = this.sandbox.disabledGlobals as Record<string, DisabledGlobalInfo>;
        return disabled[name]?.message;
    }

    /**
     * Get all disabled global names
     */
    getDisabledNames(): string[] {
        return Object.keys(this.sandbox.disabledGlobals);
    }

    // ---------------------------------------------------------------------------
    // Custom Types
    // ---------------------------------------------------------------------------

    /**
     * Get a custom type definition
     */
    getType(typeName: string): TypeDefinition | undefined {
        const types = this.sandbox.types as Record<string, TypeDefinition>;
        return types[typeName];
    }

    /**
     * Get all custom type names
     */
    getTypeNames(): string[] {
        return Object.keys(this.sandbox.types);
    }

    /**
     * Get fields for a custom type
     */
    getTypeFields(typeName: string): Record<string, { type: string; description?: string; optional?: boolean }> | undefined {
        const type = this.getType(typeName);
        return type?.fields;
    }

    // ---------------------------------------------------------------------------
    // Return Types
    // ---------------------------------------------------------------------------

    /**
     * Get return type info for execution mode
     */
    getReturnTypeInfo(executionMode: string): ReturnTypeInfo | undefined {
        const returnTypes = this.sandbox.returnTypes as Record<string, ReturnTypeInfo>;
        return returnTypes[executionMode];
    }

    // ---------------------------------------------------------------------------
    // Resolution Helpers
    // ---------------------------------------------------------------------------

    /**
     * Resolve a member access path (e.g., "helpers.fetch", "string.len")
     */
    resolveMemberPath(path: string[]): FieldDefinition | undefined {
        if (path.length === 0) return undefined;

        const [root, ...rest] = path;

        // Check sandbox items first (data-driven)
        const sandboxItem = this.getSandboxItem(root);
        if (sandboxItem) {
            if (rest.length === 0) return sandboxItem as unknown as FieldDefinition;
            if (rest.length === 1 && sandboxItem.fields) {
                return sandboxItem.fields[rest[0]];
            }
            return undefined;
        }

        // Check libraries (data-driven)
        const lib = this.getLibrary(root);
        if (lib) {
            if (rest.length === 0) return lib;
            if (rest.length === 1) return lib.fields[rest[0]];
            return undefined;
        }

        // Check globals
        const global = this.getGlobal(root);
        if (global && rest.length === 0) {
            return global as unknown as FieldDefinition;
        }

        return undefined;
    }

    /**
     * Get completion items for a member access on a given base
     */
    getMemberCompletions(basePath: string[], hookName?: string): Array<{ name: string; definition: FieldDefinition }> {
        const results: Array<{ name: string; definition: FieldDefinition }> = [];

        if (basePath.length === 0) return results;

        const [root, ...rest] = basePath;

        if (rest.length !== 0) return results;

        // Check sandbox items (data-driven)
        const sandboxItem = this.getSandboxItem(root);
        if (sandboxItem) {
            // Use hook-specific fields for context
            if (this.hasHookVariants(root)) {
                const fields = this.getContextFieldsForHook(hookName);
                for (const [name, def] of Object.entries(fields)) {
                    results.push({ name, definition: def as FieldDefinition });
                }
            } else if (sandboxItem.fields) {
                for (const [name, def] of Object.entries(sandboxItem.fields)) {
                    results.push({ name, definition: def as FieldDefinition });
                }
            }
            return results;
        }

        // Check libraries (data-driven)
        const lib = this.getLibrary(root);
        if (lib?.fields) {
            for (const [name, def] of Object.entries(lib.fields)) {
                results.push({ name, definition: def as FieldDefinition });
            }
        }

        return results;
    }

    // ---------------------------------------------------------------------------
    // Type Resolution
    // ---------------------------------------------------------------------------

    /**
     * Resolve a type name to its expanded definition fields
     * Handles custom types defined in sandbox-definitions.json
     * 
     * @param typeName - The type name to resolve (e.g., "FetchResponse", "PipelineUser")
     * @returns The type's field definitions, or undefined if not found
     * 
     * @example
     * const fields = loader.resolveTypeName("FetchResponse");
     * // Returns: { status: { type: "number", ... }, body: { type: "string", ... }, ... }
     */
    resolveTypeName(typeName: string): Record<string, { type: string; description?: string; optional?: boolean }> | undefined {
        return this.getTypeFields(typeName);
    }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let definitionLoaderInstance: DefinitionLoader | null = null;

/**
 * Get the shared definition loader instance
 */
export function getDefinitionLoader(): DefinitionLoader {
    if (!definitionLoaderInstance) {
        definitionLoaderInstance = new DefinitionLoader();
    }
    return definitionLoaderInstance;
}
