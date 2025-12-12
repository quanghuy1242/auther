// =============================================================================
// FIND REFERENCES HANDLER
// =============================================================================
// Provides find-references functionality for the Lua editor
// Inspired by EmmyLua's handlers/references module structure
// See: emmylua_ls/src/handlers/references/

import type { Position, Location, Range } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import type { Symbol, SymbolId } from "../analysis/symbol-table";
import {
    findNodePathAtOffset,
    isIdentifier,
    isMemberExpression,
    walkAST,
} from "../core/luaparse-types";
import type {
    LuaNode,
    LuaIdentifier,
    LuaMemberExpression,
} from "../core/luaparse-types";

// =============================================================================
// REFERENCE RESULT
// =============================================================================

/**
 * A single reference to a symbol
 */
export interface Reference {
    /** Location of the reference */
    location: Location;
    /** Whether this is the definition site */
    isDefinition: boolean;
    /** Whether this is a write (assignment) */
    isWrite: boolean;
}

// =============================================================================
// REFERENCE OPTIONS
// =============================================================================

/**
 * Options for find-references
 */
export interface ReferencesOptions {
    /** Whether to include the definition in results */
    includeDeclaration?: boolean;
    /** Document URI for location building */
    documentUri?: string;
}

// =============================================================================
// REFERENCE SEARCHER
// =============================================================================

/**
 * Searches for all references to a symbol
 * Following EmmyLua's reference_searcher pattern
 */
class ReferenceSearcher {
    private references: Reference[] = [];

    constructor(
        private document: LuaDocument,
        private analysisResult: AnalysisResult,
        private uri: string,
        private includeDeclaration: boolean
    ) { }

    /**
     * Search for references to a symbol
     */
    searchSymbol(symbol: Symbol): Reference[] {
        this.references = [];

        // Add definition if requested
        if (this.includeDeclaration) {
            this.references.push({
                location: {
                    uri: this.uri,
                    range: symbol.range,
                },
                isDefinition: true,
                isWrite: true,
            });
        }

        // Add all tracked references from the symbol
        for (const refOffset of symbol.references) {
            const range = this.offsetToRange(refOffset, symbol.name.length);
            this.references.push({
                location: {
                    uri: this.uri,
                    range,
                },
                isDefinition: false,
                isWrite: this.isWriteReference(refOffset),
            });
        }

        return this.references;
    }

    /**
     * Search for references to a name (when no symbol is found)
     */
    searchName(name: string): Reference[] {
        this.references = [];
        const ast = this.document.getAST();
        if (!ast) return this.references;

        // Walk the AST to find all identifiers with this name
        walkAST(ast, (node: LuaNode) => {
            if (isIdentifier(node)) {
                const ident = node as LuaIdentifier;
                if (ident.name === name && ident.range) {
                    this.references.push({
                        location: {
                            uri: this.uri,
                            range: this.document.offsetRangeToRange(ident.range[0], ident.range[1]),
                        },
                        isDefinition: false,
                        isWrite: false,
                    });
                }
            }
        });

        return this.references;
    }

    /**
     * Search for references to a member (e.g., helpers.fetch)
     */
    searchMember(baseName: string, memberName: string): Reference[] {
        this.references = [];
        const ast = this.document.getAST();
        if (!ast) return this.references;

        // Walk the AST to find matching member expressions
        walkAST(ast, (node: LuaNode) => {
            if (isMemberExpression(node)) {
                const memberExpr = node as LuaMemberExpression;
                if (
                    isIdentifier(memberExpr.base) &&
                    (memberExpr.base as LuaIdentifier).name === baseName &&
                    memberExpr.identifier.name === memberName &&
                    memberExpr.range
                ) {
                    this.references.push({
                        location: {
                            uri: this.uri,
                            range: this.document.offsetRangeToRange(
                                memberExpr.identifier.range?.[0] ?? memberExpr.range[0],
                                memberExpr.identifier.range?.[1] ?? memberExpr.range[1]
                            ),
                        },
                        isDefinition: false,
                        isWrite: false,
                    });
                }
            }
        });

        return this.references;
    }

    private offsetToRange(offset: number, length: number): Range {
        return this.document.offsetRangeToRange(offset, offset + length);
    }

    private isWriteReference(offset: number): boolean {
        // Check if this reference is on the left side of an assignment
        const ast = this.document.getAST();
        if (!ast) return false;

        // Find node at offset
        const path = findNodePathAtOffset(ast, offset);

        // Check if any parent is an assignment and we're on the left side
        for (let i = path.length - 1; i >= 0; i--) {
            const node = path[i];
            if (node.type === "AssignmentStatement") {
                // Check if current identifier is in variables (left side)
                const assignNode = node as unknown as {
                    variables: LuaNode[];
                    init: LuaNode[];
                };
                for (const variable of assignNode.variables) {
                    if (variable.range && offset >= variable.range[0] && offset <= variable.range[1]) {
                        return true;
                    }
                }
                break;
            }
            if (node.type === "LocalStatement") {
                // All local statement identifiers are definitions
                return true;
            }
        }

        return false;
    }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Main find-references handler following EmmyLua's references function
 */
export function getReferences(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    position: Position,
    options: ReferencesOptions = {}
): Reference[] {
    const ast = document.getAST();
    if (!ast) return [];

    const offset = document.positionToOffset(position);
    const uri = options.documentUri ?? "file://untitled";
    const includeDeclaration = options.includeDeclaration ?? true;

    // Find the node at the position
    const path = findNodePathAtOffset(ast, offset);
    if (path.length === 0) return [];

    const node = path[path.length - 1];
    const searcher = new ReferenceSearcher(document, analysisResult, uri, includeDeclaration);

    // Handle identifier
    if (isIdentifier(node)) {
        const ident = node as LuaIdentifier;
        const name = ident.name;

        // First check symbol table
        const symbol = analysisResult.symbolTable.lookupSymbol(name, ident.range?.[0]);
        if (symbol) {
            return searcher.searchSymbol(symbol);
        }

        // Fall back to name search
        return searcher.searchName(name);
    }

    // Handle member expression
    if (isMemberExpression(node)) {
        const memberExpr = node as LuaMemberExpression;
        const memberName = memberExpr.identifier.name;

        if (isIdentifier(memberExpr.base)) {
            const baseName = (memberExpr.base as LuaIdentifier).name;
            return searcher.searchMember(baseName, memberName);
        }
    }

    // Check if we're on the member identifier
    const parent = path.length > 1 ? path[path.length - 2] : null;
    if (parent && isMemberExpression(parent) && isIdentifier(node)) {
        const memberExpr = parent as LuaMemberExpression;
        if (memberExpr.identifier === node && isIdentifier(memberExpr.base)) {
            const baseName = (memberExpr.base as LuaIdentifier).name;
            return searcher.searchMember(baseName, (node as LuaIdentifier).name);
        }
    }

    return [];
}

/**
 * Get all references to a symbol by ID
 */
export function getSymbolReferences(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    symbolId: SymbolId,
    options: ReferencesOptions = {}
): Reference[] {
    const symbol = analysisResult.symbolTable.getSymbol(symbolId);
    if (!symbol) return [];

    const uri = options.documentUri ?? "file://untitled";
    const includeDeclaration = options.includeDeclaration ?? true;

    const searcher = new ReferenceSearcher(document, analysisResult, uri, includeDeclaration);
    return searcher.searchSymbol(symbol);
}

/**
 * Get all references in the document (for highlighting all occurrences)
 */
export function getAllSymbolOccurrences(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    name: string,
    options: ReferencesOptions = {}
): Reference[] {
    const uri = options.documentUri ?? "file://untitled";
    const searcher = new ReferenceSearcher(document, analysisResult, uri, true);
    return searcher.searchName(name);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { ReferenceSearcher };
