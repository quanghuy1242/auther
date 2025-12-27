// =============================================================================
// EXPRESSION TYPE INFERENCE
// =============================================================================
// Core expression type inference extracted from SemanticAnalyzer
// Port of EmmyLua's infer_expr module

import type { LuaType, LuaFunctionType, LuaFunctionParam } from '../type-system';
import { LuaTypes, LuaTypeKind, functionType } from '../type-system';
import type {
    LuaExpression,
    LuaIdentifier,
    LuaFunctionExpression,
    LuaMemberExpression,
    LuaIndexExpression,
    LuaCallExpression,
    LuaTableConstructorExpression,
    LuaBinaryExpression,
    LuaUnaryExpression,
    LuaLogicalExpression
} from '../../core/luaparse-types';
import { isIdentifier } from '../../core/luaparse-types';
import { inferBinaryExpressionType, inferLogicalExpressionType, inferUnaryExpressionType } from './infer-binary';
import { inferCallExpressionType } from './infer-call';
import { inferTableType } from './infer-table';
import { inferMemberExpressionType, inferIndexExpressionType } from './infer-member';

// =============================================================================
// INFER CONTEXT
// =============================================================================

/**
 * Context required for type inference operations
 * This allows the inference functions to access analyzer state without
 * creating circular dependencies.
 */
export interface InferContext {
    /** Look up a symbol by name, returns its type if found */
    lookupSymbolType: (name: string, offset?: number) => LuaType | null;
    /** Infer the type of a nested expression */
    inferType: (expr: LuaExpression) => LuaType;
    /** Get definition loader for global/library lookups */
    getDefinitionLoader: () => {
        getGlobal: (name: string) => unknown;
        getLibrary: (name: string) => { fields?: Record<string, unknown> } | undefined;
        getHelper: (name: string) => { kind: string; async?: boolean; returns?: { type: string } } | undefined;
        getLibraryMethod: (lib: string, method: string) => { kind: string; returns?: { type: string } } | undefined;
        getContextFieldsForHook: (hookName?: string) => Record<string, { kind: string; type?: string; optional?: boolean }>;
        getType: (typeName: string) => { fields?: Record<string, { type: string }> } | undefined;
    };
    /** Current hook name for context-specific lookups */
    hookName?: string;
    /** Convert a definition to LuaType */
    definitionToType: (def: unknown) => LuaType;
    /** Convert a global definition to LuaType */
    globalDefinitionToType: (def: unknown) => LuaType;
    /** Build helpers type */
    buildHelpersType: () => LuaType;
    /** Build context type */
    buildContextType: () => LuaType;
}

// =============================================================================
// EXPRESSION TYPE INFERENCE
// =============================================================================

/**
 * Infer the type of an expression
 * Port of EmmyLua's infer_expr function
 */
export function inferExpressionType(
    expr: LuaExpression,
    context: InferContext
): LuaType {
    if (!expr) return LuaTypes.Unknown;

    switch (expr.type) {
        case 'NilLiteral':
            return LuaTypes.Nil;

        case 'BooleanLiteral':
            return LuaTypes.Boolean;

        case 'NumericLiteral':
            return LuaTypes.Number;

        case 'StringLiteral':
            return LuaTypes.String;

        case 'VarargLiteral':
            return { kind: LuaTypeKind.Variadic, elementType: LuaTypes.Any };

        case 'Identifier':
            return inferIdentifierType(expr as LuaIdentifier, context);

        case 'MemberExpression':
            return inferMemberExpressionType(
                expr as LuaMemberExpression,
                context.inferType,
                context.getDefinitionLoader,
                context.hookName,
                context.definitionToType
            );

        case 'IndexExpression':
            return inferIndexExpressionType(
                expr as LuaIndexExpression,
                context.inferType,
                () => ({ getTypeFields: (context.getDefinitionLoader().getType as unknown as (name: string) => Record<string, { type: string }>) })
            );

        case 'CallExpression':
        case 'StringCallExpression':
        case 'TableCallExpression':
            return inferCallExpressionType(
                expr as LuaCallExpression,
                context.inferType,
                () => ({
                    getLibraryMethod: (context.getDefinitionLoader().getLibraryMethod),
                    getHelper: context.getDefinitionLoader().getHelper
                })
            );

        case 'FunctionExpression':
            return buildFunctionType(expr as LuaFunctionExpression);

        case 'TableConstructorExpression':
            return inferTableType(
                expr as LuaTableConstructorExpression,
                context.inferType
            );

        case 'BinaryExpression':
            return inferBinaryExpressionType(
                expr as LuaBinaryExpression,
                context.inferType
            );

        case 'UnaryExpression':
            return inferUnaryExpressionType(
                expr as LuaUnaryExpression,
                context.inferType
            );

        case 'LogicalExpression':
            return inferLogicalExpressionType(
                expr as LuaLogicalExpression,
                context.inferType
            );

        default:
            return LuaTypes.Unknown;
    }
}

/**
 * Infer the type of an identifier
 */
function inferIdentifierType(ident: LuaIdentifier, context: InferContext): LuaType {
    const name = ident.name;

    // Check local symbol table
    const symbolType = context.lookupSymbolType(name, ident.range?.[0]);
    if (symbolType) {
        return symbolType;
    }

    // Check definitions
    const definitionLoader = context.getDefinitionLoader();

    const globalDef = definitionLoader.getGlobal(name);
    if (globalDef) {
        return context.globalDefinitionToType(globalDef);
    }

    const libDef = definitionLoader.getLibrary(name);
    if (libDef) {
        return context.definitionToType(libDef);
    }

    // Check sandbox
    if (name === 'helpers') {
        return context.buildHelpersType();
    }
    if (name === 'context') {
        return context.buildContextType();
    }
    if (name === 'await') {
        return LuaTypes.Function;
    }

    return LuaTypes.Unknown;
}

/**
 * Build a function type from a function expression
 */
function buildFunctionType(decl: LuaFunctionExpression): LuaFunctionType {
    const params: LuaFunctionParam[] = [];

    for (const param of decl.parameters) {
        if (isIdentifier(param)) {
            params.push({
                name: (param as LuaIdentifier).name,
                type: LuaTypes.Unknown,
            });
        } else {
            // Vararg
            params.push({
                name: '...',
                type: LuaTypes.Any,
                vararg: true,
            });
        }
    }

    return functionType(params, [LuaTypes.Unknown]);
}
