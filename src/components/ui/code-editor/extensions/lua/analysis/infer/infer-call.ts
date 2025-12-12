// =============================================================================
// CALL EXPRESSION TYPE INFERENCE
// =============================================================================
// Type inference for function calls
// Port of EmmyLua's infer_call module

import type { LuaType, LuaFunctionType } from '../type-system';
import { LuaTypes, LuaTypeKind, parseTypeString } from '../type-system';
import type { LuaCallExpression, LuaExpression, LuaIdentifier, LuaMemberExpression } from '../../core/luaparse-types';
import { isIdentifier, isMemberExpression } from '../../core/luaparse-types';

/**
 * Infer the type of a call expression
 * Port of EmmyLua's infer_call_expr
 */
export function inferCallExpressionType(
    call: LuaCallExpression,
    analyzeExpr: (e: LuaExpression) => LuaType,
    getDefinitionLoader: () => {
        getLibraryMethod: (lib: string, method: string) => { kind: string; returns?: { type: string } } | undefined;
        getHelper: (name: string) => { returns?: { type: string } } | undefined;
    }
): LuaType {
    const baseType = analyzeExpr(call.base as LuaExpression);

    // Analyze arguments to ensure references are tracked
    if (call.arguments && Array.isArray(call.arguments)) {
        for (const arg of call.arguments) {
            analyzeExpr(arg);
        }
    }

    // If we have a function type, return its return type
    if (baseType.kind === LuaTypeKind.FunctionType) {
        const fnType = baseType as LuaFunctionType;
        if (fnType.returns.length > 0) {
            return fnType.returns.length === 1
                ? fnType.returns[0]
                : { kind: LuaTypeKind.Tuple, elements: fnType.returns } as LuaType;
        }
        return LuaTypes.Void;
    }

    // Handle known function calls via definitions
    if (isMemberExpression(call.base)) {
        const memberExpr = call.base as LuaMemberExpression;
        if (isIdentifier(memberExpr.base)) {
            const baseName = (memberExpr.base as LuaIdentifier).name;
            const methodName = memberExpr.identifier.name;

            const definitionLoader = getDefinitionLoader();

            // Check library methods
            const methodDef = definitionLoader.getLibraryMethod(baseName, methodName);
            if (methodDef?.kind === 'function' && methodDef.returns) {
                return parseTypeString(methodDef.returns.type);
            }

            // Check helpers
            if (baseName === 'helpers') {
                const helperDef = definitionLoader.getHelper(methodName);
                if (helperDef?.returns) {
                    return parseTypeString(helperDef.returns.type);
                }
            }
        }
    }

    return LuaTypes.Unknown;
}
