// =============================================================================
// GO-TO-DEFINITION HANDLER
// =============================================================================
// Provides go-to-definition functionality for the Lua editor
// Inspired by EmmyLua's handlers/definition module structure
// See: emmylua_ls/src/handlers/definition/

import type { Position, Location } from "../protocol";
import { createRange } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import type { Symbol } from "../analysis/symbol-table";
import {
    findNodePathAtOffset,
    isIdentifier,
    isMemberExpression,
} from "../core/luaparse-types";
import type {
    LuaIdentifier,
    LuaMemberExpression,
} from "../core/luaparse-types";
import { getDefinitionLoader } from "../definitions/definition-loader";

// =============================================================================
// DEFINITION RESULT
// =============================================================================

/**
 * Result of a go-to-definition request
 */
export interface DefinitionResult {
    /** The location of the definition */
    location: Location;
    /** The symbol at the definition */
    symbol?: Symbol;
    /** Whether this is a built-in definition (no source) */
    isBuiltin?: boolean;
    /** Builtin name for external lookups */
    builtinName?: string;
}

// =============================================================================
// DEFINITION OPTIONS
// =============================================================================

/**
 * Options for go-to-definition
 */
export interface DefinitionOptions {
    /** Current hook name for context */
    hookName?: string;
    /** Document URI for location building */
    documentUri?: string;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Main go-to-definition handler following EmmyLua's definition function
 */
export function getDefinition(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    position: Position,
    options: DefinitionOptions = {}
): DefinitionResult | null {
    const ast = document.getAST();
    if (!ast) return null;

    const offset = document.positionToOffset(position);
    const uri = options.documentUri ?? "file://untitled";

    // Find the node at the position
    const path = findNodePathAtOffset(ast, offset);
    if (path.length === 0) return null;

    const node = path[path.length - 1];

    // Handle identifier
    if (isIdentifier(node)) {
        return handleIdentifierDefinition(
            document,
            analysisResult,
            node as LuaIdentifier,
            uri
        );
    }

    // Handle member expression (helpers.fetch, context.user)
    if (isMemberExpression(node)) {
        return handleMemberExpressionDefinition(
            document,
            analysisResult,
            node as LuaMemberExpression,
            uri,
            options
        );
    }

    // Check if we're on the identifier part of a member expression
    const parent = path.length > 1 ? path[path.length - 2] : null;
    if (parent && isMemberExpression(parent)) {
        const memberExpr = parent as LuaMemberExpression;
        if (isIdentifier(node) && memberExpr.identifier === node) {
            return handleMemberExpressionDefinition(
                document,
                analysisResult,
                memberExpr,
                uri,
                options
            );
        }
    }

    return null;
}

/**
 * Handle go-to-definition for a simple identifier
 */
function handleIdentifierDefinition(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    ident: LuaIdentifier,
    uri: string
): DefinitionResult | null {
    const name = ident.name;
    const offset = ident.range?.[0];

    // First check the symbol table
    const symbol = analysisResult.symbolTable.lookupSymbol(name, offset);

    if (symbol) {
        // Found a symbol - return its definition location
        return {
            location: {
                uri,
                range: symbol.range,
            },
            symbol,
        };
    }

    // Check if it's a builtin global
    const definitionLoader = getDefinitionLoader();
    const globalDef = definitionLoader.getGlobal(name);

    if (globalDef) {
        return {
            location: {
                uri: "builtin://lua-stdlib",
                range: createRange({ line: 0, character: 0 }, { line: 0, character: 0 }),
            },
            isBuiltin: true,
            builtinName: name,
        };
    }

    // Check for sandbox items (data-driven)
    const builtinUri = definitionLoader.getBuiltinUri(name);
    if (builtinUri) {
        return {
            location: {
                uri: builtinUri,
                range: createRange({ line: 0, character: 0 }, { line: 0, character: 0 }),
            },
            isBuiltin: true,
            builtinName: name,
        };
    }

    return null;
}

/**
 * Handle go-to-definition for a member expression
 */
function handleMemberExpressionDefinition(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    memberExpr: LuaMemberExpression,
    uri: string,
    options: DefinitionOptions
): DefinitionResult | null {
    const memberName = memberExpr.identifier.name;
    const definitionLoader = getDefinitionLoader();

    // Check if base is an identifier
    if (isIdentifier(memberExpr.base)) {
        const baseName = (memberExpr.base as LuaIdentifier).name;

        // Handle sandbox item members (data-driven)
        const sandboxItem = definitionLoader.getSandboxItem(baseName);
        if (sandboxItem) {
            const builtinUri = definitionLoader.getBuiltinUri(baseName);

            // Check if member exists
            if (definitionLoader.hasHookVariants(baseName)) {
                // Hook-variant item (like context)
                const contextFields = definitionLoader.getContextFieldsForHook(options.hookName);
                const fieldDef = contextFields[memberName];
                if (fieldDef) {
                    return {
                        location: {
                            uri: builtinUri ?? "builtin://sandbox",
                            range: createRange({ line: 0, character: 0 }, { line: 0, character: 0 }),
                        },
                        isBuiltin: true,
                        builtinName: `${baseName}.${memberName}`,
                    };
                }
            } else if (sandboxItem.fields?.[memberName]) {
                return {
                    location: {
                        uri: builtinUri ?? "builtin://sandbox",
                        range: createRange({ line: 0, character: 0 }, { line: 0, character: 0 }),
                    },
                    isBuiltin: true,
                    builtinName: `${baseName}.${memberName}`,
                };
            }
        }

        // Handle library methods (string.*, math.*, table.*)
        const libMethod = definitionLoader.getLibraryMethod(baseName, memberName);
        if (libMethod) {
            return {
                location: {
                    uri: "builtin://lua-stdlib",
                    range: createRange({ line: 0, character: 0 }, { line: 0, character: 0 }),
                },
                isBuiltin: true,
                builtinName: `${baseName}.${memberName}`,
            };
        }

        // Check if base is a local variable with a table type
        const baseSymbol = analysisResult.symbolTable.lookupSymbol(baseName, memberExpr.base.range?.[0]);
        if (baseSymbol) {
            // The member is on a user-defined table
            // For now, we can't resolve this further without more sophisticated analysis
            return null;
        }
    }

    return null;
}

/**
 * Get definition at offset (convenience function)
 */
export function getDefinitionAtOffset(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    offset: number,
    options: DefinitionOptions = {}
): DefinitionResult | null {
    const position = document.offsetToPosition(offset);
    return getDefinition(document, analysisResult, position, options);
}
