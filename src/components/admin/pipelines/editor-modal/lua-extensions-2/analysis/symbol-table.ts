// =============================================================================
// SYMBOL TABLE
// =============================================================================
// Symbol tracking and scope management inspired by EmmyLua's declaration system
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/db_index/declaration/

import type { Range } from "../protocol";
import type { LuaType } from "./type-system";
import { LuaTypes } from "./type-system";

// =============================================================================
// SYMBOL KINDS
// =============================================================================

/**
 * Kinds of symbols in the symbol table
 * Similar to EmmyLua's LuaDeclExtra
 */
export enum SymbolKind {
    Local = "local",
    Global = "global",
    Parameter = "parameter",
    UpValue = "upvalue",
    Field = "field",
    Method = "method",
    Function = "function",
    Label = "label",
    LoopVariable = "loop_variable",
}

/**
 * Symbol declaration attributes
 */
export interface SymbolAttributes {
    isConst?: boolean;
    isClose?: boolean;
    isImplicitSelf?: boolean;
    isVararg?: boolean;
}

// =============================================================================
// SYMBOL
// =============================================================================

/**
 * Symbol ID unique within a document
 */
export type SymbolId = number;

/**
 * Represents a declared symbol (variable, function, etc.)
 * Similar to EmmyLua's LuaDecl
 */
export interface Symbol {
    /** Unique ID within document */
    id: SymbolId;

    /** Symbol name */
    name: string;

    /** Symbol kind */
    kind: SymbolKind;

    /** Inferred or declared type */
    type: LuaType;

    /** Declaration range */
    range: Range;

    /** Scope where declared */
    scopeId: ScopeId;

    /** Optional documentation */
    documentation?: string;

    /** Additional attributes */
    attributes?: SymbolAttributes;

    /** For upvalues: ID of the original symbol */
    originalSymbolId?: SymbolId;

    /** Definition site offset */
    definitionOffset: number;

    /** References to this symbol (offsets) */
    references: Set<number>;
}

// =============================================================================
// SCOPE
// =============================================================================

/**
 * Scope ID unique within a document
 */
export type ScopeId = number;

/**
 * Scope kinds
 * Similar to EmmyLua's LuaScopeKind
 */
export enum ScopeKind {
    Global = "global",
    Function = "function",
    Method = "method",
    Block = "block",
    For = "for",
    ForIn = "for_in",
    While = "while",
    Repeat = "repeat",
    If = "if",
    Do = "do",
}

/**
 * Represents a lexical scope
 * Similar to EmmyLua's LuaScope
 */
export interface Scope {
    /** Unique ID within document */
    id: ScopeId;

    /** Scope kind */
    kind: ScopeKind;

    /** Parent scope ID */
    parentId: ScopeId | null;

    /** Child scope IDs */
    children: ScopeId[];

    /** Symbols declared in this scope */
    symbols: Map<string, SymbolId>;

    /** Range of the scope */
    range: Range;

    /** Start offset */
    startOffset: number;

    /** End offset */
    endOffset: number;
}

// =============================================================================
// SYMBOL TABLE
// =============================================================================

/**
 * Symbol table for a single document
 * Similar to EmmyLua's LuaDeclarationTree
 */
export class SymbolTable {
    private symbols: Map<SymbolId, Symbol> = new Map();
    private scopes: Map<ScopeId, Scope> = new Map();
    private nextSymbolId: SymbolId = 1;
    private nextScopeId: ScopeId = 1;

    /** Root scope (global) */
    readonly rootScopeId: ScopeId;

    /** Current scope during analysis */
    private currentScopeId: ScopeId;

    constructor() {
        // Create root/global scope
        const rootScope: Scope = {
            id: 0,
            kind: ScopeKind.Global,
            parentId: null,
            children: [],
            symbols: new Map(),
            range: { start: { line: 0, character: 0 }, end: { line: Number.MAX_SAFE_INTEGER, character: 0 } },
            startOffset: 0,
            endOffset: Number.MAX_SAFE_INTEGER,
        };
        this.scopes.set(0, rootScope);
        this.rootScopeId = 0;
        this.currentScopeId = 0;
    }

    // ---------------------------------------------------------------------------
    // Scope Management
    // ---------------------------------------------------------------------------

    /**
     * Enter a new scope
     */
    enterScope(kind: ScopeKind, range: Range, startOffset: number, endOffset: number): Scope {
        const scope: Scope = {
            id: this.nextScopeId++,
            kind,
            parentId: this.currentScopeId,
            children: [],
            symbols: new Map(),
            range,
            startOffset,
            endOffset,
        };

        // Add to parent's children
        const parent = this.scopes.get(this.currentScopeId);
        if (parent) {
            parent.children.push(scope.id);
        }

        this.scopes.set(scope.id, scope);
        this.currentScopeId = scope.id;
        return scope;
    }

    /**
     * Add a global symbol directly (used for sandbox)
     */
    addGlobalSymbol(symbol: Symbol): void {
        this.symbols.set(symbol.id, symbol);
        const rootScope = this.scopes.get(this.rootScopeId);
        if (rootScope) {
            rootScope.symbols.set(symbol.name, symbol.id);
        }
    }

    /**
     * Exit current scope
     */
    exitScope(): void {
        const current = this.scopes.get(this.currentScopeId);
        if (current && current.parentId !== null) {
            this.currentScopeId = current.parentId;
        }
    }

    /**
     * Get current scope
     */
    getCurrentScope(): Scope {
        return this.scopes.get(this.currentScopeId)!;
    }

    /**
     * Get scope by ID
     */
    getScope(id: ScopeId): Scope | undefined {
        return this.scopes.get(id);
    }

    /**
     * Get root scope
     */
    getRootScope(): Scope {
        return this.scopes.get(this.rootScopeId)!;
    }

    /**
   * Find scope containing an offset
   */
    findScopeAtOffset(offset: number): Scope | undefined {
        let found: Scope | undefined;

        this.scopes.forEach((scope) => {
            if (offset >= scope.startOffset && offset <= scope.endOffset) {
                // Find most specific (smallest containing) scope
                if (!found || (scope.endOffset - scope.startOffset) < (found.endOffset - found.startOffset)) {
                    found = scope;
                }
            }
        });

        return found;
    }

    /**
     * Get all ancestor scopes (from current to root)
     */
    getAncestorScopes(scopeId: ScopeId): Scope[] {
        const ancestors: Scope[] = [];
        let current = this.scopes.get(scopeId);

        while (current) {
            ancestors.push(current);
            if (current.parentId === null) break;
            current = this.scopes.get(current.parentId);
        }

        return ancestors;
    }

    // ---------------------------------------------------------------------------
    // Symbol Management
    // ---------------------------------------------------------------------------

    /**
     * Declare a symbol in the current scope
     */
    declareSymbol(
        name: string,
        kind: SymbolKind,
        type: LuaType,
        range: Range,
        offset: number,
        options?: {
            documentation?: string;
            attributes?: SymbolAttributes;
            scopeId?: ScopeId;
        }
    ): Symbol {
        const scopeId = options?.scopeId ?? this.currentScopeId;
        const scope = this.scopes.get(scopeId);

        const symbol: Symbol = {
            id: this.nextSymbolId++,
            name,
            kind,
            type,
            range,
            scopeId,
            documentation: options?.documentation,
            attributes: options?.attributes,
            definitionOffset: offset,
            references: new Set(),
        };

        this.symbols.set(symbol.id, symbol);

        // Add to scope's symbol map
        if (scope) {
            scope.symbols.set(name, symbol.id);
        }

        return symbol;
    }

    /**
     * Add a reference to a symbol
     */
    addReference(symbolId: SymbolId, offset: number): void {
        const symbol = this.symbols.get(symbolId);
        if (symbol) {
            symbol.references.add(offset);
        }
    }

    /**
     * Lookup a symbol by name, searching from current scope to root
     */
    lookupSymbol(name: string, fromOffset?: number): Symbol | undefined {
        const startScope = fromOffset !== undefined
            ? this.findScopeAtOffset(fromOffset)
            : this.scopes.get(this.currentScopeId);

        if (!startScope) return undefined;

        // Walk up the scope chain
        for (const scope of this.getAncestorScopes(startScope.id)) {
            const symbolId = scope.symbols.get(name);
            if (symbolId !== undefined) {
                return this.symbols.get(symbolId);
            }
        }

        return undefined;
    }

    /**
     * Lookup a symbol in a specific scope only (no ancestor search)
     */
    lookupSymbolInScope(name: string, scopeId: ScopeId): Symbol | undefined {
        const scope = this.scopes.get(scopeId);
        if (!scope) return undefined;

        const symbolId = scope.symbols.get(name);
        return symbolId !== undefined ? this.symbols.get(symbolId) : undefined;
    }

    /**
     * Check if a symbol is defined at a given offset (is it accessible?)
     */
    isSymbolVisibleAtOffset(symbol: Symbol, offset: number): boolean {
        // Symbol must be declared before the offset
        if (symbol.definitionOffset > offset) return false;

        // Check if the offset is within the symbol's scope chain
        const scopeAtOffset = this.findScopeAtOffset(offset);
        if (!scopeAtOffset) return false;

        const ancestorIds = new Set(this.getAncestorScopes(scopeAtOffset.id).map((s) => s.id));
        return ancestorIds.has(symbol.scopeId);
    }

    /**
     * Get symbol by ID
     */
    getSymbol(id: SymbolId): Symbol | undefined {
        return this.symbols.get(id);
    }

    /**
     * Get all symbols
     */
    getAllSymbols(): Symbol[] {
        return Array.from(this.symbols.values());
    }

    /**
     * Get symbols in a scope
     */
    getSymbolsInScope(scopeId: ScopeId): Symbol[] {
        const scope = this.scopes.get(scopeId);
        if (!scope) return [];

        return Array.from(scope.symbols.values())
            .map((id) => this.symbols.get(id))
            .filter((s): s is Symbol => s !== undefined);
    }

    /**
     * Get all visible symbols at an offset
     */
    getVisibleSymbolsAtOffset(offset: number): Symbol[] {
        const scope = this.findScopeAtOffset(offset);
        if (!scope) return [];

        const visible: Map<string, Symbol> = new Map();

        // Walk up scope chain, first found wins (shadowing)
        for (const ancestorScope of this.getAncestorScopes(scope.id)) {
            ancestorScope.symbols.forEach((symbolId, name) => {
                if (!visible.has(name)) {
                    const symbol = this.symbols.get(symbolId);
                    if (symbol && symbol.definitionOffset <= offset) {
                        visible.set(name, symbol);
                    }
                }
            });
        }

        return Array.from(visible.values());
    }

    /**
   * Find symbol at a specific offset (for go-to-definition)
   */
    findSymbolAtOffset(offset: number): Symbol | undefined {
        let result: Symbol | undefined;
        this.symbols.forEach((symbol) => {
            // Convert range to rough offset bounds
            if (symbol.definitionOffset <= offset && offset <= symbol.definitionOffset + symbol.name.length) {
                result = symbol;
            }
        });
        return result;
    }

    /**
     * Update a symbol's type
     */
    updateSymbolType(symbolId: SymbolId, type: LuaType): void {
        const symbol = this.symbols.get(symbolId);
        if (symbol) {
            symbol.type = type;
        }
    }

    // ---------------------------------------------------------------------------
    // Upvalue Detection
    // ---------------------------------------------------------------------------

    /**
     * Check if a symbol reference is an upvalue (captured from outer scope)
     */
    isUpvalue(symbolId: SymbolId, fromScopeId: ScopeId): boolean {
        const symbol = this.symbols.get(symbolId);
        if (!symbol) return false;

        // Find the nearest function scope containing fromScopeId
        let current = this.scopes.get(fromScopeId);
        while (current) {
            if (current.kind === ScopeKind.Function || current.kind === ScopeKind.Method) {
                // Check if symbol is declared in this function or any outer scope
                if (symbol.scopeId === current.id) return false;

                // Check parent chain
                let symbolScope = this.scopes.get(symbol.scopeId);
                while (symbolScope) {
                    if (symbolScope.id === current.id) return false;
                    symbolScope = symbolScope.parentId !== null ? this.scopes.get(symbolScope.parentId) : undefined;
                }

                // Symbol is from outer scope - it's an upvalue
                return true;
            }
            current = current.parentId !== null ? this.scopes.get(current.parentId) : undefined;
        }

        return false;
    }

    // ---------------------------------------------------------------------------
    // Utility
    // ---------------------------------------------------------------------------

    /**
     * Clear all symbols and scopes
     */
    clear(): void {
        this.symbols.clear();
        this.scopes.clear();
        this.nextSymbolId = 1;
        this.nextScopeId = 1;

        // Recreate root scope
        const rootScope: Scope = {
            id: 0,
            kind: ScopeKind.Global,
            parentId: null,
            children: [],
            symbols: new Map(),
            range: { start: { line: 0, character: 0 }, end: { line: Number.MAX_SAFE_INTEGER, character: 0 } },
            startOffset: 0,
            endOffset: Number.MAX_SAFE_INTEGER,
        };
        this.scopes.set(0, rootScope);
        this.currentScopeId = 0;
    }

    /**
   * Get debug representation
   */
    toDebugString(): string {
        const lines: string[] = ["=== Symbol Table ==="];

        const formatScope = (scopeId: ScopeId, indent: string): void => {
            const scope = this.scopes.get(scopeId);
            if (!scope) return;

            lines.push(`${indent}Scope ${scopeId} (${scope.kind}):`);
            scope.symbols.forEach((symbolId, name) => {
                const symbol = this.symbols.get(symbolId);
                if (symbol) {
                    lines.push(`${indent}  ${name}: ${symbol.kind} (id=${symbolId})`);
                }
            });

            for (const childId of scope.children) {
                formatScope(childId, indent + "  ");
            }
        };

        formatScope(this.rootScopeId, "");
        return lines.join("\n");
    }
}

// =============================================================================
// GLOBAL SYMBOL REGISTRY
// =============================================================================

/**
 * Pre-populated globals for the sandbox environment
 */
export function createSandboxSymbols(): Map<string, Symbol> {
    const globals = new Map<string, Symbol>();
    let id = 10000; // Start high to avoid conflicts

    const addGlobal = (name: string, type: LuaType, doc?: string) => {
        globals.set(name, {
            id: id++,
            name,
            kind: SymbolKind.Global,
            type,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            scopeId: 0,
            documentation: doc,
            definitionOffset: 0,
            references: new Set(),
        });
    };

    // Standard Lua globals
    addGlobal("assert", LuaTypes.Function, "Raises an error if v is false");
    addGlobal("collectgarbage", LuaTypes.Function, "Generic garbage collector interface");
    addGlobal("error", LuaTypes.Function, "Raises an error");
    addGlobal("getmetatable", LuaTypes.Function, "Returns the metatable of object");
    addGlobal("ipairs", LuaTypes.Function, "Iterator for array tables");
    addGlobal("next", LuaTypes.Function, "Returns next key-value pair");
    addGlobal("pairs", LuaTypes.Function, "Iterator for all key-value pairs");
    addGlobal("pcall", LuaTypes.Function, "Protected function call");
    addGlobal("print", LuaTypes.Function, "Prints values");
    addGlobal("select", LuaTypes.Function, "Returns arguments after index");
    addGlobal("setmetatable", LuaTypes.Function, "Sets the metatable");
    addGlobal("tonumber", LuaTypes.Function, "Converts to number");
    addGlobal("tostring", LuaTypes.Function, "Converts to string");
    addGlobal("type", LuaTypes.Function, "Returns type string");
    addGlobal("unpack", LuaTypes.Function, "Returns table elements");
    addGlobal("xpcall", LuaTypes.Function, "Extended protected call");
    addGlobal("_G", LuaTypes.Table, "Global environment table");
    addGlobal("_VERSION", LuaTypes.String, "Lua version string");

    // Standard libraries
    addGlobal("string", LuaTypes.Table, "String manipulation library");
    addGlobal("table", LuaTypes.Table, "Table manipulation library");
    addGlobal("math", LuaTypes.Table, "Mathematical functions library");

    // Boolean constants
    addGlobal("true", LuaTypes.Boolean, "Boolean true");
    addGlobal("false", LuaTypes.Boolean, "Boolean false");
    addGlobal("nil", LuaTypes.Nil, "Nil value");

    // Sandbox-specific globals
    addGlobal("helpers", LuaTypes.Table, "Pipeline helper functions");
    addGlobal("context", LuaTypes.Table, "Hook context data");
    addGlobal("await", LuaTypes.Function, "Awaits an async operation");

    return globals;
}
