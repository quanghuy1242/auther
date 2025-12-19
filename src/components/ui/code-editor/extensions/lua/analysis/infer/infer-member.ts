// =============================================================================
// MEMBER EXPRESSION TYPE INFERENCE
// =============================================================================
// Type inference for member and index expressions
// Port of EmmyLua's member access inference

import type { LuaType, LuaTableType, LuaTupleType, LuaUnionType, LuaRefType } from '../type-system';
import { LuaTypes, LuaTypeKind, parseTypeString } from '../type-system';
import type {
    LuaMemberExpression,
    LuaIndexExpression,
    LuaExpression,
    LuaIdentifier
} from '../../core/luaparse-types';
import { isIdentifier } from '../../core/luaparse-types';

/**
 * Infer the type of a member expression (a.b)
 * Port of EmmyLua's member access inference
 */
export function inferMemberExpressionType(
    expr: LuaMemberExpression,
    analyzeExpr: (e: LuaExpression) => LuaType,
    getDefinitionLoader: () => {
        getHelper: (name: string) => unknown;
        getContextFieldsForHook: (hookName?: string) => Record<string, { kind: string; type?: string }>;
        getLibrary: (name: string) => { fields?: Record<string, unknown> } | undefined;
        getType: (typeName: string) => { fields?: Record<string, { type: string }> } | undefined;
    },
    hookName: string | undefined,
    definitionToType: (def: unknown) => LuaType
): LuaType {
    const baseType = analyzeExpr(expr.base as LuaExpression);
    const memberName = expr.identifier.name;

    // Handle table types with fields
    if (baseType.kind === LuaTypeKind.TableType) {
        const field = (baseType as LuaTableType).fields.get(memberName);
        if (field) {
            return field.type;
        }
    }

    // Handle reference types
    if (baseType.kind === LuaTypeKind.Ref) {
        // Look up in custom types
        const definitionLoader = getDefinitionLoader();
        const typeDef = definitionLoader.getType((baseType as LuaRefType).name);
        if (typeDef?.fields?.[memberName]) {
            return parseTypeString(typeDef.fields[memberName].type);
        }
    }

    // Handle helpers/context member access
    if (isIdentifier(expr.base)) {
        const baseName = (expr.base as LuaIdentifier).name;
        const definitionLoader = getDefinitionLoader();

        if (baseName === 'helpers') {
            const helperDef = definitionLoader.getHelper(memberName);
            if (helperDef) {
                return definitionToType(helperDef);
            }
        }

        if (baseName === 'context') {
            const contextFields = definitionLoader.getContextFieldsForHook(hookName);
            const fieldDef = contextFields[memberName];
            if (fieldDef) {
                return definitionToType(fieldDef);
            }
        }

        // Standard library access
        const libDef = definitionLoader.getLibrary(baseName);
        if (libDef?.fields?.[memberName]) {
            return definitionToType(libDef.fields[memberName]);
        }
    }

    return LuaTypes.Unknown;
}

/**
 * Infer the type of an index expression (a[b])
 * Port of EmmyLua's index access inference
 */
export function inferIndexExpressionType(
    expr: LuaIndexExpression,
    analyzeExpr: (e: LuaExpression) => LuaType,
    getDefinitionLoader: () => {
        getTypeFields: (typeName: string) => Record<string, { type: string }> | undefined;
    }
): LuaType {
    const baseType = analyzeExpr(expr.base as LuaExpression);
    const indexType = analyzeExpr(expr.index as LuaExpression);

    // Handle array access
    if (baseType.kind === LuaTypeKind.Array) {
        return (baseType as { elementType: LuaType }).elementType;
    }

    // Handle tuple with numeric index
    if (baseType.kind === LuaTypeKind.Tuple) {
        const tupleType = baseType as LuaTupleType;
        if (indexType.kind === LuaTypeKind.NumberLiteral) {
            const index = (indexType as { value: number }).value;
            // Lua is 1-indexed
            if (index >= 1 && index <= tupleType.elements.length) {
                return tupleType.elements[index - 1];
            }
        }
        // For non-literal index, return first element (simplified)
        if (tupleType.elements.length > 0) {
            return tupleType.elements[0];
        }
    }

    // Handle table with index type
    if (baseType.kind === LuaTypeKind.TableType) {
        const tableType = baseType as LuaTableType;

        // Check for string literal index
        if (indexType.kind === LuaTypeKind.StringLiteral) {
            const key = (indexType as { value: string }).value;
            const field = tableType.fields.get(key);
            if (field) {
                return field.type;
            }
        }

        // Check for numeric literal index
        if (indexType.kind === LuaTypeKind.NumberLiteral) {
            const key = String((indexType as { value: number }).value);
            const field = tableType.fields.get(key);
            if (field) {
                return field.type;
            }
        }

        // Generic value type
        if (tableType.valueType) {
            return tableType.valueType;
        }
    }

    // Handle Ref types by looking up type definitions
    if (baseType.kind === LuaTypeKind.Ref) {
        const refTypeName = (baseType as LuaRefType).name;
        const definitionLoader = getDefinitionLoader();
        const typeFields = definitionLoader.getTypeFields(refTypeName);
        if (typeFields && indexType.kind === LuaTypeKind.StringLiteral) {
            const key = (indexType as { value: string }).value;
            if (typeFields[key]) {
                return parseTypeString(typeFields[key].type);
            }
        }
    }

    // Handle Union types - try each member
    if (baseType.kind === LuaTypeKind.Union) {
        const unionType = baseType as LuaUnionType;
        for (const member of unionType.types) {
            // Skip nil in union
            if (member.kind === LuaTypeKind.Nil) continue;

            const memberResult = inferMemberTypeFromBase(member, indexType);
            if (memberResult.kind !== LuaTypeKind.Unknown) {
                return memberResult;
            }
        }
    }

    return LuaTypes.Unknown;
}

/**
 * Helper to infer member type from a base type and index type
 * Used for Union type handling in index expressions
 */
function inferMemberTypeFromBase(baseType: LuaType, indexType: LuaType): LuaType {
    if (baseType.kind === LuaTypeKind.Array) {
        return (baseType as { elementType: LuaType }).elementType;
    }

    if (baseType.kind === LuaTypeKind.TableType) {
        const tableType = baseType as LuaTableType;
        if (indexType.kind === LuaTypeKind.StringLiteral) {
            const key = (indexType as { value: string }).value;
            const field = tableType.fields.get(key);
            if (field) return field.type;
        }
        if (tableType.valueType) return tableType.valueType;
    }

    return LuaTypes.Unknown;
}
