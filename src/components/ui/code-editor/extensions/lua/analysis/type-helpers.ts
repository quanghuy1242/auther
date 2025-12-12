// =============================================================================
// TYPE HELPERS
// =============================================================================
// Port of EmmyLua's is_* methods from types.rs
// Provides unified type checking utilities for the semantic analyzer
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/db_index/type/types.rs

import {
    LuaType,
    LuaTypeKind,
    LuaUnionType,
    LuaTableType,
    LuaFunctionType,
    LuaArrayType,
    LuaTupleType,
    LuaBooleanLiteralType,
    LuaTableTypeField,
} from './type-system';

// =============================================================================
// TYPE KIND PREDICATES
// =============================================================================

/**
 * Check if type is table-like (can have members accessed via dot or bracket)
 * Port of LuaType::is_table() from EmmyLua
 */
export function isTableLike(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Table:
        case LuaTypeKind.TableType:
        case LuaTypeKind.Array:
        case LuaTypeKind.Tuple:
            return true;
        default:
            return false;
    }
}

/**
 * Check if type is function-like (can be called)
 * Port of LuaType::is_function() from EmmyLua
 */
export function isFunctionLike(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Function:
        case LuaTypeKind.FunctionType:
            return true;
        default:
            return false;
    }
}

/**
 * Check if type is string-like
 * Port of LuaType::is_string() from EmmyLua
 */
export function isStringLike(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.String:
        case LuaTypeKind.StringLiteral:
            return true;
        default:
            return false;
    }
}

/**
 * Check if type is number-like
 * Port of LuaType::is_number() from EmmyLua
 */
export function isNumberLike(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Number:
        case LuaTypeKind.Integer:
        case LuaTypeKind.NumberLiteral:
            return true;
        default:
            return false;
    }
}

/**
 * Check if type is integer-like
 * Port of LuaType::is_integer() from EmmyLua
 */
export function isIntegerLike(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Integer:
        case LuaTypeKind.NumberLiteral:
            // NumberLiteral could be integer if it's a whole number
            if (type.kind === LuaTypeKind.NumberLiteral) {
                const numType = type as { value: number };
                return Number.isInteger(numType.value);
            }
            return true;
        default:
            return false;
    }
}

/**
 * Check if type is boolean-like
 * Port of LuaType::is_boolean() from EmmyLua
 */
export function isBooleanLike(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Boolean:
        case LuaTypeKind.BooleanLiteral:
            return true;
        default:
            return false;
    }
}

/**
 * Check if type is nullable (can be nil)
 * Port of LuaType::is_nullable() from EmmyLua
 */
export function isNullable(type: LuaType): boolean {
    if (type.kind === LuaTypeKind.Nil) return true;
    if (type.kind === LuaTypeKind.Unknown || type.kind === LuaTypeKind.Any) return true;
    if (type.kind === LuaTypeKind.Union) {
        const union = type as LuaUnionType;
        return union.types.some(t => t.kind === LuaTypeKind.Nil);
    }
    return false;
}

/**
 * Check if type is optional (can be nil, any, unknown, or variadic)
 * Port of LuaType::is_optional() from EmmyLua
 */
export function isOptional(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Nil:
        case LuaTypeKind.Any:
        case LuaTypeKind.Unknown:
        case LuaTypeKind.Variadic:
            return true;
        case LuaTypeKind.Union:
            return (type as LuaUnionType).types.some(t => isOptional(t));
        default:
            return false;
    }
}

/**
 * Check if type is always truthy (never nil or false)
 * Port of LuaType::is_always_truthy() from EmmyLua
 */
export function isAlwaysTruthy(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Nil:
        case LuaTypeKind.Boolean:
        case LuaTypeKind.Any:
        case LuaTypeKind.Unknown:
            return false;
        case LuaTypeKind.BooleanLiteral:
            return (type as LuaBooleanLiteralType).value === true;
        case LuaTypeKind.Union:
            return (type as LuaUnionType).types.every(t => isAlwaysTruthy(t));
        default:
            return true;
    }
}

/**
 * Check if type is always falsy (always nil or false)
 * Port of LuaType::is_always_falsy() from EmmyLua
 */
export function isAlwaysFalsy(type: LuaType): boolean {
    switch (type.kind) {
        case LuaTypeKind.Nil:
            return true;
        case LuaTypeKind.BooleanLiteral:
            return (type as LuaBooleanLiteralType).value === false;
        case LuaTypeKind.Union:
            return (type as LuaUnionType).types.every(t => isAlwaysFalsy(t));
        default:
            return false;
    }
}

/**
 * Check if type is an array type
 * Port of LuaType::is_array() from EmmyLua
 */
export function isArrayType(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Array;
}

/**
 * Check if type is a tuple type
 * Port of LuaType::is_tuple() from EmmyLua
 */
export function isTupleType(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Tuple;
}

/**
 * Check if type is a union type
 * Port of LuaType::is_union() from EmmyLua
 */
export function isUnionType(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Union;
}

/**
 * Check if type is a reference type
 * Port of LuaType::is_ref() from EmmyLua
 */
export function isRefType(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Ref;
}

/**
 * Check if type is unknown
 * Port of LuaType::is_unknown() from EmmyLua
 */
export function isUnknown(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Unknown;
}

/**
 * Check if type is any
 */
export function isAny(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Any;
}

/**
 * Check if type is never
 * Port of LuaType::is_never() from EmmyLua
 */
export function isNever(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Never;
}

// =============================================================================
// TYPE FIELD ACCESS UTILITIES
// =============================================================================

/**
 * Get the fields map from a table-like type
 * Returns null if type doesn't have accessible fields
 */
export function getTableFields(type: LuaType): Map<string, LuaTableTypeField> | null {
    if (type.kind === LuaTypeKind.TableType) {
        return (type as LuaTableType).fields;
    }
    return null;
}

/**
 * Find a specific member type from a type
 * This is a simplified version - full member resolution is in member-resolution.ts
 */
export function findMemberType(type: LuaType, memberName: string): LuaType | null {
    // TableType - look up in fields map
    if (type.kind === LuaTypeKind.TableType) {
        const tableType = type as LuaTableType;
        const field = tableType.fields?.get(memberName);
        return field?.type ?? null;
    }

    // Array - numeric index returns element type
    if (type.kind === LuaTypeKind.Array) {
        const arrayType = type as LuaArrayType;
        // Check if memberName is numeric
        if (/^\d+$/.test(memberName)) {
            return arrayType.elementType;
        }
        return null;
    }

    // Tuple - numeric index returns specific element type
    if (type.kind === LuaTypeKind.Tuple) {
        const tupleType = type as LuaTupleType;
        const index = parseInt(memberName, 10);
        if (!isNaN(index) && index >= 1 && index <= tupleType.elements.length) {
            return tupleType.elements[index - 1]; // Lua is 1-indexed
        }
        return null;
    }

    // Union - try to find member in all union members
    if (type.kind === LuaTypeKind.Union) {
        const union = type as LuaUnionType;
        for (const member of union.types) {
            const memberType = findMemberType(member, memberName);
            if (memberType) return memberType;
        }
        return null;
    }

    return null;
}

/**
 * Get all members from a type as a map
 * This is a simplified version - full member resolution is in member-resolution.ts
 */
export function getAllMembers(type: LuaType): Map<string, LuaType> {
    const members = new Map<string, LuaType>();

    if (type.kind === LuaTypeKind.TableType) {
        const tableType = type as LuaTableType;
        for (const [name, field] of tableType.fields) {
            members.set(name, field.type);
        }
    }

    if (type.kind === LuaTypeKind.Tuple) {
        const tupleType = type as LuaTupleType;
        tupleType.elements.forEach((elem, idx) => {
            members.set(String(idx + 1), elem); // Lua is 1-indexed
        });
    }

    return members;
}

/**
 * Get function parameters if type is function-like
 */
export function getFunctionParams(type: LuaType): LuaFunctionType['params'] | null {
    if (type.kind === LuaTypeKind.FunctionType) {
        return (type as LuaFunctionType).params;
    }
    return null;
}

/**
 * Get function return types if type is function-like
 */
export function getFunctionReturns(type: LuaType): LuaType[] | null {
    if (type.kind === LuaTypeKind.FunctionType) {
        return (type as LuaFunctionType).returns;
    }
    return null;
}

/**
 * Get array element type if type is array-like
 */
export function getArrayElementType(type: LuaType): LuaType | null {
    if (type.kind === LuaTypeKind.Array) {
        return (type as LuaArrayType).elementType;
    }
    return null;
}

/**
 * Unwrap a type to its base (for unions with single non-nil member, etc.)
 */
export function unwrapType(type: LuaType): LuaType {
    if (type.kind === LuaTypeKind.Union) {
        const union = type as LuaUnionType;
        // Filter out nil
        const nonNil = union.types.filter(t => t.kind !== LuaTypeKind.Nil);
        if (nonNil.length === 1) {
            return unwrapType(nonNil[0]);
        }
    }
    return type;
}
