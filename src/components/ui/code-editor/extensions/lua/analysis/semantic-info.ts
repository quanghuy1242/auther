// =============================================================================
// SEMANTIC INFO
// =============================================================================
// Port of EmmyLua's semantic_info module
// Provides unified semantic information (type + declaration) for AST nodes
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/semantic/semantic_info/

import type { LuaNode, LuaExpression, LuaIdentifier, LuaMemberExpression } from '../core/luaparse-types';
import {
    isIdentifier,
    isMemberExpression,
    isCallExpression,
    isTableConstructor,
    isLiteral,
    isFunctionExpression,
    isBinaryExpression,
    isUnaryExpression,
    isLogicalExpression,
    isIndexExpression,
} from '../core/luaparse-types';
import type { LuaType } from './type-system';
import { LuaTypes, formatType } from './type-system';
import type { Symbol } from './symbol-table';
import type { AnalysisResult } from './analyzer';
import { isTableLike, findMemberType } from './type-helpers';
import { getDefinitionLoader, type GlobalDefinition, type FieldDefinition } from '../definitions/definition-loader';
import { inferTableType } from './infer/infer-table';

// =============================================================================
// EXPRESSION RESOLUTION
// =============================================================================

/**
 * Robustly resolve the type of an expression
 * Handles nested table constructors vs cached types vs literals
 */
export function resolveExpressionType(
    analysisResult: AnalysisResult,
    expr: LuaExpression
): LuaType {
    if (!expr || !expr.range) {
        return LuaTypes.Unknown;
    }

    // 1. Check cache first
    const cachedType = analysisResult.types.get(expr.range[0]);

    // 2. Special handling for table constructors to get nested structure
    // (Cache might store generic table type, but we want detailed structure for hover)
    if (isTableConstructor(expr)) {
        return inferTableType(expr as import('../core/luaparse-types').LuaTableConstructorExpression, (e) => resolveExpressionType(analysisResult, e));
    }

    // 3. Return cached type if available
    if (cachedType) {
        return cachedType;
    }

    // 4. Fallback for literals (if not in cache for some reason)
    switch (expr.type) {
        case "StringLiteral": return LuaTypes.String;
        case "NumericLiteral": return LuaTypes.Number;
        case "BooleanLiteral": return LuaTypes.Boolean;
        case "NilLiteral": return LuaTypes.Nil;
        case "FunctionExpression": return LuaTypes.Function;
        case "Identifier": {
            // Should have been in cache or symbol table, but basic fallback
            return LuaTypes.Unknown;
        }
        default: return LuaTypes.Unknown;
    }
}

// =============================================================================
// SEMANTIC INFO TYPES
// =============================================================================

/**
 * Semantic declaration - where a symbol/member is defined
 * Port of LuaSemanticDeclId from EmmyLua
 */
export type SemanticDecl =
    | { kind: 'symbol'; symbol: Symbol }
    | { kind: 'global'; name: string; definition: GlobalDefinition }
    | { kind: 'member'; name: string; ownerType: LuaType; definition?: FieldDefinition }
    | { kind: 'parameter'; name: string; funcSymbol?: Symbol }
    | { kind: 'tableField'; fieldName: string; tableType: LuaType };

/**
 * Complete semantic information for a node
 * Port of SemanticInfo struct from EmmyLua
 */
export interface SemanticInfo {
    /** The inferred type of the node */
    type: LuaType;
    /** Where the node is declared/defined (if applicable) */
    declaration?: SemanticDecl;
    /** Whether this is a table field */
    isTableField?: boolean;
    /** Field name if it's a table field */
    fieldName?: string;
}

// =============================================================================
// MAIN API
// =============================================================================

export interface SemanticInfoOptions {
    hookName?: string;
}

/**
 * Get complete semantic information for an AST node
 * Port of get_semantic_info from EmmyLua's SemanticModel
 * 
 * This is the main entry point for getting type and declaration info
 * for hover, go-to-definition, etc.
 */
export function getSemanticInfo(
    analysisResult: AnalysisResult,
    node: LuaNode,
    options: SemanticInfoOptions = {}
): SemanticInfo | null {
    // Handle identifiers
    if (isIdentifier(node)) {
        return getIdentifierSemanticInfo(analysisResult, node as LuaIdentifier);
    }

    // Handle member expressions (e.g., t.field, helpers.matches)
    if (isMemberExpression(node)) {
        return getMemberExpressionSemanticInfo(analysisResult, node as LuaMemberExpression, options);
    }

    // Handle call expressions
    if (isCallExpression(node)) {
        return getExpressionSemanticInfo(analysisResult, node as LuaExpression);
    }

    // Handle table constructors
    if (isTableConstructor(node)) {
        return getTableConstructorSemanticInfo(analysisResult, node as LuaExpression);
    }

    // Handle function expressions
    if (isFunctionExpression(node)) {
        return getExpressionSemanticInfo(analysisResult, node as LuaExpression);
    }

    // Handle literals
    if (isLiteral(node)) {
        return getLiteralSemanticInfo(node);
    }

    // Handle binary/unary/logical expressions
    if (isBinaryExpression(node) || isUnaryExpression(node) || isLogicalExpression(node)) {
        return getExpressionSemanticInfo(analysisResult, node as LuaExpression);
    }

    // Handle index expressions (t[key])
    if (isIndexExpression(node)) {
        return getExpressionSemanticInfo(analysisResult, node as LuaExpression);
    }

    // Fallback: resolve type robustly
    const resolvedType = resolveExpressionType(analysisResult, node as LuaExpression);
    if (resolvedType.kind !== LuaTypes.Unknown.kind) {
        return { type: resolvedType };
    }

    return null;
}

// =============================================================================
// IDENTIFIER SEMANTIC INFO
// =============================================================================

/**
 * Get semantic info for an identifier
 * Port of infer_name.rs logic
 */
function getIdentifierSemanticInfo(
    analysisResult: AnalysisResult,
    ident: LuaIdentifier
): SemanticInfo | null {
    const name = ident.name;
    const offset = ident.range?.[0];
    const definitionLoader = getDefinitionLoader();

    // ==========================================================================
    // Check ALL known globals FIRST to prevent shadowing by local symbols
    // Order: sandbox items → libraries → builtins
    // ==========================================================================

    // 1. Check sandbox items (helpers, context)
    const sandboxItem = definitionLoader.getSandboxItem(name);
    if (sandboxItem) {
        const cachedType = offset !== undefined ? analysisResult.types.get(offset) : undefined;
        return {
            type: cachedType ?? LuaTypes.Unknown,
            declaration: { kind: 'global', name, definition: sandboxItem },
        };
    }

    // 2. Check libraries (string, math, table, etc.) - BEFORE local symbols
    const libDef = definitionLoader.getLibrary(name);
    if (libDef) {
        const cachedType = offset !== undefined ? analysisResult.types.get(offset) : undefined;
        return {
            type: cachedType ?? LuaTypes.Unknown,
            declaration: { kind: 'global', name, definition: libDef as unknown as GlobalDefinition },
        };
    }

    // 3. Check built-in globals (print, type, etc.)
    const globalDef = definitionLoader.getGlobal(name);
    if (globalDef) {
        const cachedType = offset !== undefined ? analysisResult.types.get(offset) : undefined;
        return {
            type: cachedType ?? LuaTypes.Unknown,
            declaration: { kind: 'global', name, definition: globalDef },
        };
    }

    // ==========================================================================
    // Only AFTER checking all known globals, check local symbols
    // ==========================================================================

    // 4. Check local symbols
    const symbol = analysisResult.symbolTable.lookupSymbol(name, offset);
    if (symbol) {
        const type = getNarrowedType(analysisResult, symbol, offset);
        return {
            type,
            declaration: { kind: 'symbol', symbol },
        };
    }

    // 5. Fallback to cached type
    if (offset !== undefined) {
        const cachedType = analysisResult.types.get(offset);
        if (cachedType) {
            return { type: cachedType };
        }
    }

    return null;
}

// =============================================================================
// MEMBER EXPRESSION SEMANTIC INFO
// =============================================================================

/**
 * Get semantic info for a member expression (e.g., t.field, obj.method)
 * Port of infer_index.rs logic for member expressions
 */
function getMemberExpressionSemanticInfo(
    analysisResult: AnalysisResult,
    expr: LuaMemberExpression,
    options: SemanticInfoOptions = {}
): SemanticInfo | null {
    const memberName = expr.identifier.name;
    const definitionLoader = getDefinitionLoader();

    // Get the base semantic info
    const baseInfo = getSemanticInfo(analysisResult, expr.base, options);

    // Check if we have cached type for this expression
    const cachedType = expr.range ? analysisResult.types.get(expr.range[0]) : undefined;

    // If base is a global/sandbox item, check its members
    if (baseInfo?.declaration?.kind === 'global') {
        const globalName = baseInfo.declaration.name;
        const memberDef = definitionLoader.getMemberDefinition(globalName, memberName, options.hookName);

        if (memberDef) {
            return {
                type: cachedType ?? LuaTypes.Unknown,
                declaration: {
                    kind: 'member',
                    name: memberName,
                    ownerType: baseInfo.type,
                    definition: memberDef
                },
            };
        }
    }

    // Check if base type is table-like with this member
    if (baseInfo && isTableLike(baseInfo.type)) {
        const memberType = findMemberType(baseInfo.type, memberName);
        if (memberType) {
            return {
                type: memberType,
                declaration: { kind: 'tableField', fieldName: memberName, tableType: baseInfo.type },
                isTableField: true,
                fieldName: memberName,
            };
        }
    }

    // Check library methods (string.sub, math.floor, etc.)
    if (isIdentifier(expr.base)) {
        const baseName = (expr.base as LuaIdentifier).name;
        const libMethod = definitionLoader.getLibraryMethod(baseName, memberName);
        if (libMethod) {
            return {
                type: cachedType ?? LuaTypes.Unknown,
                declaration: {
                    kind: 'member',
                    name: memberName,
                    ownerType: baseInfo?.type ?? LuaTypes.Unknown,
                    definition: libMethod
                },
            };
        }
    }

    // Fallback to cached type
    if (cachedType) {
        return { type: cachedType };
    }

    return null;
}

// =============================================================================
// EXPRESSION SEMANTIC INFO
// =============================================================================

/**
 * Get semantic info for a general expression
 */
function getExpressionSemanticInfo(
    analysisResult: AnalysisResult,
    expr: LuaExpression
): SemanticInfo | null {
    // Try to get from type cache
    if (expr.range) {
        const cachedType = analysisResult.types.get(expr.range[0]);
        if (cachedType) {
            return { type: cachedType };
        }
    }

    return null;
}

/**
 * Get semantic info for a table constructor
 */
function getTableConstructorSemanticInfo(
    analysisResult: AnalysisResult,
    expr: LuaExpression
): SemanticInfo | null {
    // Table constructors should have their type in the cache
    if (expr.range) {
        const cachedType = analysisResult.types.get(expr.range[0]);
        if (cachedType && isTableLike(cachedType)) {
            return { type: cachedType };
        }
    }

    return null;
}

/**
 * Get semantic info for a literal
 */
function getLiteralSemanticInfo(node: LuaNode): SemanticInfo | null {
    // Infer literal type from node type
    switch (node.type) {
        case 'StringLiteral':
            return { type: LuaTypes.String };
        case 'NumericLiteral':
            return { type: LuaTypes.Number };
        case 'BooleanLiteral':
            return { type: LuaTypes.Boolean };
        case 'NilLiteral':
            return { type: LuaTypes.Nil };
        default:
            return null;
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get narrowed type for a symbol at a specific offset
 */
function getNarrowedType(
    analysisResult: AnalysisResult,
    symbol: Symbol,
    _offset?: number
): LuaType {
    if (!symbol.type) {
        return LuaTypes.Unknown;
    }

    // For now, just return the symbol type
    // Full flow-based narrowing can be added later
    return symbol.type;
}

/**
 * Find the declaration for a node (for go-to-definition)
 */
export function findDeclaration(
    analysisResult: AnalysisResult,
    node: LuaNode
): SemanticDecl | null {
    const semanticInfo = getSemanticInfo(analysisResult, node);
    return semanticInfo?.declaration ?? null;
}

/**
 * Get the type for formatting in hover
 */
export function getFormattedType(
    semanticInfo: SemanticInfo,
    options?: { multiline?: boolean; maxDepth?: number }
): string {
    return formatType(semanticInfo.type, options);
}

/**
 * Check if a node has a declaration that can be navigated to
 */
export function hasNavigableDeclaration(semanticInfo: SemanticInfo): boolean {
    if (!semanticInfo.declaration) return false;

    switch (semanticInfo.declaration.kind) {
        case 'symbol':
            return true; // Local symbols can be navigated
        case 'global':
            return true; // Globals have builtin URIs
        case 'member':
            return !!semanticInfo.declaration.definition;
        case 'tableField':
            return true;
        case 'parameter':
            return !!semanticInfo.declaration.funcSymbol;
        default:
            return false;
    }
}
