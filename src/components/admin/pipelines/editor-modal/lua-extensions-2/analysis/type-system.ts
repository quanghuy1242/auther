// =============================================================================
// LUA TYPE SYSTEM
// =============================================================================
// Type representation and operations inspired by EmmyLua's LuaType enum
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/db_index/type/types.rs

// =============================================================================
// LUA TYPE KINDS
// =============================================================================

/**
 * Lua type kind enumeration
 * Mirrors EmmyLua's LuaType variants
 */
export enum LuaTypeKind {
    // Primitive types
    Unknown = "unknown",
    Any = "any",
    Nil = "nil",
    Boolean = "boolean",
    Number = "number",
    Integer = "integer",
    String = "string",
    Table = "table",
    Function = "function",
    Thread = "thread",
    Userdata = "userdata",

    // Special types
    Never = "never",
    Void = "void",

    // Literal types
    BooleanLiteral = "boolean_literal",
    NumberLiteral = "number_literal",
    StringLiteral = "string_literal",

    // Compound types
    Union = "union",
    Intersection = "intersection",
    Array = "array",
    Tuple = "tuple",

    // Reference types
    Ref = "ref", // Reference to a named type
    TableType = "table_type", // Table with specific fields

    // Function types
    FunctionType = "function_type",

    // Generic types
    Generic = "generic",
    TypeParameter = "type_parameter",

    // Variadic
    Variadic = "variadic",
}

// =============================================================================
// LUA TYPE INTERFACES
// =============================================================================

/**
 * Base interface for all Lua types
 */
export interface LuaTypeBase {
    kind: LuaTypeKind;
}

/**
 * Primitive types (nil, boolean, number, string, table, function, etc.)
 */
export interface LuaPrimitiveType extends LuaTypeBase {
    kind:
    | LuaTypeKind.Unknown
    | LuaTypeKind.Any
    | LuaTypeKind.Nil
    | LuaTypeKind.Boolean
    | LuaTypeKind.Number
    | LuaTypeKind.Integer
    | LuaTypeKind.String
    | LuaTypeKind.Table
    | LuaTypeKind.Function
    | LuaTypeKind.Thread
    | LuaTypeKind.Userdata
    | LuaTypeKind.Never
    | LuaTypeKind.Void;
}

/**
 * Boolean literal type
 */
export interface LuaBooleanLiteralType extends LuaTypeBase {
    kind: LuaTypeKind.BooleanLiteral;
    value: boolean;
}

/**
 * Number literal type
 */
export interface LuaNumberLiteralType extends LuaTypeBase {
    kind: LuaTypeKind.NumberLiteral;
    value: number;
}

/**
 * String literal type
 */
export interface LuaStringLiteralType extends LuaTypeBase {
    kind: LuaTypeKind.StringLiteral;
    value: string;
}

/**
 * Union type (A | B | C)
 */
export interface LuaUnionType extends LuaTypeBase {
    kind: LuaTypeKind.Union;
    types: LuaType[];
}

/**
 * Intersection type (A & B)
 */
export interface LuaIntersectionType extends LuaTypeBase {
    kind: LuaTypeKind.Intersection;
    types: LuaType[];
}

/**
 * Array type (T[])
 */
export interface LuaArrayType extends LuaTypeBase {
    kind: LuaTypeKind.Array;
    elementType: LuaType;
}

/**
 * Tuple type [T1, T2, ...]
 */
export interface LuaTupleType extends LuaTypeBase {
    kind: LuaTypeKind.Tuple;
    elements: LuaType[];
}

/**
 * Reference to a named type
 */
export interface LuaRefType extends LuaTypeBase {
    kind: LuaTypeKind.Ref;
    name: string;
}

/**
 * Table type with specific fields
 */
export interface LuaTableTypeField {
    name: string;
    type: LuaType;
    optional?: boolean;
    description?: string;
}

export interface LuaTableType extends LuaTypeBase {
    kind: LuaTypeKind.TableType;
    fields: Map<string, LuaTableTypeField>;
    indexType?: LuaType; // For table<K, V>
    valueType?: LuaType;
}

/**
 * Function parameter
 */
export interface LuaFunctionParam {
    name: string;
    type: LuaType;
    optional?: boolean;
    vararg?: boolean;
    description?: string;
}

/**
 * Function type
 */
export interface LuaFunctionType extends LuaTypeBase {
    kind: LuaTypeKind.FunctionType;
    params: LuaFunctionParam[];
    returns: LuaType[];
    isAsync?: boolean;
    isMethod?: boolean; // Uses : instead of .
    description?: string;
}

/**
 * Generic type instance (T<A, B>)
 */
export interface LuaGenericType extends LuaTypeBase {
    kind: LuaTypeKind.Generic;
    base: LuaType;
    typeArgs: LuaType[];
}

/**
 * Type parameter (generic placeholder)
 */
export interface LuaTypeParameterType extends LuaTypeBase {
    kind: LuaTypeKind.TypeParameter;
    name: string;
    constraint?: LuaType;
}

/**
 * Variadic type (...)
 */
export interface LuaVariadicType extends LuaTypeBase {
    kind: LuaTypeKind.Variadic;
    elementType: LuaType;
}

/**
 * Union of all Lua types
 */
export type LuaType =
    | LuaPrimitiveType
    | LuaBooleanLiteralType
    | LuaNumberLiteralType
    | LuaStringLiteralType
    | LuaUnionType
    | LuaIntersectionType
    | LuaArrayType
    | LuaTupleType
    | LuaRefType
    | LuaTableType
    | LuaFunctionType
    | LuaGenericType
    | LuaTypeParameterType
    | LuaVariadicType;

// =============================================================================
// TYPE CONSTRUCTORS
// =============================================================================

/**
 * Common type singletons
 */
export const LuaTypes = {
    Unknown: { kind: LuaTypeKind.Unknown } as LuaPrimitiveType,
    Any: { kind: LuaTypeKind.Any } as LuaPrimitiveType,
    Nil: { kind: LuaTypeKind.Nil } as LuaPrimitiveType,
    Boolean: { kind: LuaTypeKind.Boolean } as LuaPrimitiveType,
    Number: { kind: LuaTypeKind.Number } as LuaPrimitiveType,
    Integer: { kind: LuaTypeKind.Integer } as LuaPrimitiveType,
    String: { kind: LuaTypeKind.String } as LuaPrimitiveType,
    Table: { kind: LuaTypeKind.Table } as LuaPrimitiveType,
    Function: { kind: LuaTypeKind.Function } as LuaPrimitiveType,
    Thread: { kind: LuaTypeKind.Thread } as LuaPrimitiveType,
    Userdata: { kind: LuaTypeKind.Userdata } as LuaPrimitiveType,
    Never: { kind: LuaTypeKind.Never } as LuaPrimitiveType,
    Void: { kind: LuaTypeKind.Void } as LuaPrimitiveType,
};

/**
 * Create a boolean literal type
 */
export function booleanLiteral(value: boolean): LuaBooleanLiteralType {
    return { kind: LuaTypeKind.BooleanLiteral, value };
}

/**
 * Create a number literal type
 */
export function numberLiteral(value: number): LuaNumberLiteralType {
    return { kind: LuaTypeKind.NumberLiteral, value };
}

/**
 * Create a string literal type
 */
export function stringLiteral(value: string): LuaStringLiteralType {
    return { kind: LuaTypeKind.StringLiteral, value };
}

/**
 * Create a union type
 */
export function unionType(...types: LuaType[]): LuaType {
    // Flatten nested unions
    const flattened: LuaType[] = [];
    for (const t of types) {
        if (t.kind === LuaTypeKind.Union) {
            flattened.push(...(t as LuaUnionType).types);
        } else {
            flattened.push(t);
        }
    }

    // Remove duplicates
    const unique = removeDuplicateTypes(flattened);

    if (unique.length === 0) return LuaTypes.Never;
    if (unique.length === 1) return unique[0];
    return { kind: LuaTypeKind.Union, types: unique };
}

/**
 * Create an intersection type
 */
export function intersectionType(...types: LuaType[]): LuaType {
    // Flatten nested intersections
    const flattened: LuaType[] = [];
    for (const t of types) {
        if (t.kind === LuaTypeKind.Intersection) {
            flattened.push(...(t as LuaIntersectionType).types);
        } else {
            flattened.push(t);
        }
    }

    const unique = removeDuplicateTypes(flattened);

    if (unique.length === 0) return LuaTypes.Any;
    if (unique.length === 1) return unique[0];
    return { kind: LuaTypeKind.Intersection, types: unique };
}

/**
 * Create an array type
 */
export function arrayType(elementType: LuaType): LuaArrayType {
    return { kind: LuaTypeKind.Array, elementType };
}

/**
 * Create a tuple type
 */
export function tupleType(...elements: LuaType[]): LuaTupleType {
    return { kind: LuaTypeKind.Tuple, elements };
}

/**
 * Create a reference type
 */
export function refType(name: string): LuaRefType {
    return { kind: LuaTypeKind.Ref, name };
}

/**
 * Create a table type with fields
 */
export function tableType(
    fields: Array<{ name: string; type: LuaType; optional?: boolean; description?: string }>,
    indexType?: LuaType,
    valueType?: LuaType
): LuaTableType {
    const fieldMap = new Map<string, LuaTableTypeField>();
    for (const f of fields) {
        fieldMap.set(f.name, f);
    }
    return { kind: LuaTypeKind.TableType, fields: fieldMap, indexType, valueType };
}

/**
 * Create a function type
 */
export function functionType(
    params: LuaFunctionParam[],
    returns: LuaType[],
    options?: { isAsync?: boolean; isMethod?: boolean; description?: string }
): LuaFunctionType {
    return {
        kind: LuaTypeKind.FunctionType,
        params,
        returns,
        ...options,
    };
}

/**
 * Create a variadic type
 */
export function variadicType(elementType: LuaType): LuaVariadicType {
    return { kind: LuaTypeKind.Variadic, elementType };
}

// =============================================================================
// TYPE OPERATIONS
// =============================================================================

/**
 * Check if two types are equal
 */
export function typesEqual(a: LuaType, b: LuaType): boolean {
    if (a.kind !== b.kind) return false;

    switch (a.kind) {
        case LuaTypeKind.Unknown:
        case LuaTypeKind.Any:
        case LuaTypeKind.Nil:
        case LuaTypeKind.Boolean:
        case LuaTypeKind.Number:
        case LuaTypeKind.Integer:
        case LuaTypeKind.String:
        case LuaTypeKind.Table:
        case LuaTypeKind.Function:
        case LuaTypeKind.Thread:
        case LuaTypeKind.Userdata:
        case LuaTypeKind.Never:
        case LuaTypeKind.Void:
            return true;

        case LuaTypeKind.BooleanLiteral:
            return (a as LuaBooleanLiteralType).value === (b as LuaBooleanLiteralType).value;

        case LuaTypeKind.NumberLiteral:
            return (a as LuaNumberLiteralType).value === (b as LuaNumberLiteralType).value;

        case LuaTypeKind.StringLiteral:
            return (a as LuaStringLiteralType).value === (b as LuaStringLiteralType).value;

        case LuaTypeKind.Ref:
            return (a as LuaRefType).name === (b as LuaRefType).name;

        case LuaTypeKind.Array:
            return typesEqual((a as LuaArrayType).elementType, (b as LuaArrayType).elementType);

        case LuaTypeKind.Union:
        case LuaTypeKind.Intersection: {
            const aTypes = (a as LuaUnionType | LuaIntersectionType).types;
            const bTypes = (b as LuaUnionType | LuaIntersectionType).types;
            if (aTypes.length !== bTypes.length) return false;
            return aTypes.every((at, i) => typesEqual(at, bTypes[i]));
        }

        case LuaTypeKind.Tuple: {
            const aElems = (a as LuaTupleType).elements;
            const bElems = (b as LuaTupleType).elements;
            if (aElems.length !== bElems.length) return false;
            return aElems.every((ae, i) => typesEqual(ae, bElems[i]));
        }

        case LuaTypeKind.FunctionType: {
            const aFn = a as LuaFunctionType;
            const bFn = b as LuaFunctionType;
            if (aFn.params.length !== bFn.params.length) return false;
            if (aFn.returns.length !== bFn.returns.length) return false;
            const paramsMatch = aFn.params.every((p, i) =>
                typesEqual(p.type, bFn.params[i].type)
            );
            const returnsMatch = aFn.returns.every((r, i) =>
                typesEqual(r, bFn.returns[i])
            );
            return paramsMatch && returnsMatch;
        }

        default:
            return false;
    }
}

/**
 * Remove duplicate types from array
 */
function removeDuplicateTypes(types: LuaType[]): LuaType[] {
    const result: LuaType[] = [];
    for (const t of types) {
        if (!result.some((r) => typesEqual(r, t))) {
            result.push(t);
        }
    }
    return result;
}

/**
 * Check if a type is assignable to another
 * Similar to EmmyLua's check_type_compact
 */
export function isAssignableTo(source: LuaType, target: LuaType): boolean {
    // Any accepts anything
    if (target.kind === LuaTypeKind.Any) return true;
    if (source.kind === LuaTypeKind.Any) return true;

    // Unknown is compatible with everything (lenient)
    if (source.kind === LuaTypeKind.Unknown) return true;
    if (target.kind === LuaTypeKind.Unknown) return true;

    // Never is assignable to nothing, nothing assignable to never
    if (source.kind === LuaTypeKind.Never) return true;
    if (target.kind === LuaTypeKind.Never) return false;

    // Same types
    if (typesEqual(source, target)) return true;

    // Nil is assignable to optional types
    if (source.kind === LuaTypeKind.Nil) {
        if (target.kind === LuaTypeKind.Union) {
            return (target as LuaUnionType).types.some((t) => t.kind === LuaTypeKind.Nil);
        }
        return false;
    }

    // Literal types are assignable to their base types
    if (source.kind === LuaTypeKind.BooleanLiteral && target.kind === LuaTypeKind.Boolean) {
        return true;
    }
    if (
        (source.kind === LuaTypeKind.NumberLiteral || source.kind === LuaTypeKind.Integer) &&
        target.kind === LuaTypeKind.Number
    ) {
        return true;
    }
    if (source.kind === LuaTypeKind.StringLiteral && target.kind === LuaTypeKind.String) {
        return true;
    }
    if (source.kind === LuaTypeKind.Integer && target.kind === LuaTypeKind.Number) {
        return true;
    }

    // Union type: source union assignable if all members assignable
    if (source.kind === LuaTypeKind.Union) {
        return (source as LuaUnionType).types.every((t) => isAssignableTo(t, target));
    }

    // Target union: source assignable if assignable to any member
    if (target.kind === LuaTypeKind.Union) {
        return (target as LuaUnionType).types.some((t) => isAssignableTo(source, t));
    }

    // Table compatibility
    if (source.kind === LuaTypeKind.Table && target.kind === LuaTypeKind.TableType) {
        return true; // Generic table is compatible with specific table
    }
    if (source.kind === LuaTypeKind.TableType && target.kind === LuaTypeKind.Table) {
        return true;
    }

    // Function compatibility (basic)
    if (source.kind === LuaTypeKind.Function && target.kind === LuaTypeKind.FunctionType) {
        return true;
    }
    if (source.kind === LuaTypeKind.FunctionType && target.kind === LuaTypeKind.Function) {
        return true;
    }

    return false;
}

/**
 * Get the widened type (e.g., literal to base type)
 */
export function widenType(type: LuaType): LuaType {
    switch (type.kind) {
        case LuaTypeKind.BooleanLiteral:
            return LuaTypes.Boolean;
        case LuaTypeKind.NumberLiteral:
            return LuaTypes.Number;
        case LuaTypeKind.StringLiteral:
            return LuaTypes.String;
        case LuaTypeKind.Union:
            return unionType(...(type as LuaUnionType).types.map(widenType));
        default:
            return type;
    }
}

/**
 * Check if type is truthy (not nil or false)
 */
export function isTruthy(type: LuaType): boolean | undefined {
    if (type.kind === LuaTypeKind.Nil) return false;
    if (type.kind === LuaTypeKind.BooleanLiteral) {
        return (type as LuaBooleanLiteralType).value;
    }
    if (type.kind === LuaTypeKind.Boolean) return undefined;
    return true;
}

/**
 * Check if type may be nil
 */
export function mayBeNil(type: LuaType): boolean {
    if (type.kind === LuaTypeKind.Nil) return true;
    if (type.kind === LuaTypeKind.Unknown || type.kind === LuaTypeKind.Any) return true;
    if (type.kind === LuaTypeKind.Union) {
        return (type as LuaUnionType).types.some((t) => t.kind === LuaTypeKind.Nil);
    }
    return false;
}

// =============================================================================
// TYPE FORMATTING
// =============================================================================

export interface FormatOptions {
    maxDepth?: number;
    multiline?: boolean;
    indentLevel?: number;
}

/**
 * Format a type as a human-readable string
 * Similar to EmmyLua's humanize_type
 */
export function formatType(type: LuaType, options: FormatOptions = {}): string {
    const { maxDepth = 3, indentLevel = 0 } = options;
    return formatTypeInternal(type, maxDepth, indentLevel, options.multiline);
}

function formatTypeInternal(type: LuaType, maxDepth: number, depth: number, multiline = false): string {
    if (depth > maxDepth) return "...";

    switch (type.kind) {
        case LuaTypeKind.Unknown:
            return "unknown";
        case LuaTypeKind.Any:
            return "any";
        case LuaTypeKind.Nil:
            return "nil";
        case LuaTypeKind.Boolean:
            return "boolean";
        case LuaTypeKind.Number:
            return "number";
        case LuaTypeKind.Integer:
            return "integer";
        case LuaTypeKind.String:
            return "string";
        case LuaTypeKind.Table:
            return "table";
        case LuaTypeKind.Function:
            return "function";
        case LuaTypeKind.Thread:
            return "thread";
        case LuaTypeKind.Userdata:
            return "userdata";
        case LuaTypeKind.Never:
            return "never";
        case LuaTypeKind.Void:
            return "void";

        case LuaTypeKind.BooleanLiteral:
            return String((type as LuaBooleanLiteralType).value);

        case LuaTypeKind.NumberLiteral:
            return String((type as LuaNumberLiteralType).value);

        case LuaTypeKind.StringLiteral:
            return `"${(type as LuaStringLiteralType).value}"`;

        case LuaTypeKind.Union: {
            const unionType = type as LuaUnionType;
            const parts = unionType.types.map((t) => formatTypeInternal(t, maxDepth, depth + 1, multiline));
            return parts.join(" | ");
        }

        case LuaTypeKind.Intersection: {
            const intersectionType = type as LuaIntersectionType;
            const parts = intersectionType.types.map((t) => formatTypeInternal(t, maxDepth, depth + 1, multiline));
            return parts.join(" & ");
        }

        case LuaTypeKind.Array: {
            const arrayType = type as LuaArrayType;
            const elem = formatTypeInternal(arrayType.elementType, maxDepth, depth + 1, multiline);
            return `${elem}[]`;
        }

        case LuaTypeKind.Tuple: {
            const tupleType = type as LuaTupleType;
            const elems = tupleType.elements.map((t) => formatTypeInternal(t, maxDepth, depth + 1, multiline));
            return `[${elems.join(", ")}]`;
        }

        case LuaTypeKind.Ref:
            return (type as LuaRefType).name;

        case LuaTypeKind.TableType: {
            const tableType = type as LuaTableType;
            if (tableType.fields.size === 0 && tableType.indexType && tableType.valueType) {
                const k = formatTypeInternal(tableType.indexType, maxDepth, depth + 1, multiline);
                const v = formatTypeInternal(tableType.valueType, maxDepth, depth + 1, multiline);
                return `table<${k}, ${v}>`;
            }
            if (tableType.fields.size === 0) {
                return "table";
            }
            if (depth >= maxDepth - 1) {
                return `{ ${tableType.fields.size} fields... }`;
            }

            // Formatter for fields
            const formatField = (f: LuaTableTypeField) => {
                const opt = f.optional ? "?" : "";
                const typeStr = formatTypeInternal(f.type, maxDepth, depth + 1, multiline);
                return `${f.name}${opt}: ${typeStr}`;
            };

            const fields = Array.from(tableType.fields.values());

            if (multiline) {
                const indent = "    ".repeat(depth + 1);
                const closingIndent = "    ".repeat(depth);
                const fieldStrings = fields.map(f => `${indent}${formatField(f)}`);
                return `{\n${fieldStrings.join(",\n")}\n${closingIndent}}`;
            } else {
                const limit = 5;
                const fieldStrings = fields.slice(0, limit).map(formatField);
                if (fields.length > limit) {
                    fieldStrings.push("...");
                }
                return `{ ${fieldStrings.join(", ")} }`;
            }
        }

        case LuaTypeKind.FunctionType: {
            const fnType = type as LuaFunctionType;
            const params = fnType.params
                .map((p) => {
                    const opt = p.optional ? "?" : "";
                    const vararg = p.vararg ? "..." : "";
                    const typeStr = formatTypeInternal(p.type, maxDepth, depth + 1, multiline);
                    return `${vararg}${p.name}${opt}: ${typeStr}`;
                })
                .join(", ");
            const returns = fnType.returns.map((r) => formatTypeInternal(r, maxDepth, depth + 1, multiline)).join(", ");
            const asyncPrefix = fnType.isAsync ? "async " : "";
            return `${asyncPrefix}fun(${params})${returns ? `: ${returns}` : ""}`;
        }

        case LuaTypeKind.Variadic: {
            const variadicType = type as LuaVariadicType;
            return `...${formatTypeInternal(variadicType.elementType, maxDepth, depth + 1, multiline)}`;
        }

        case LuaTypeKind.TypeParameter:
            return (type as LuaTypeParameterType).name;

        case LuaTypeKind.Generic: {
            const genericType = type as LuaGenericType;
            const base = formatTypeInternal(genericType.base, maxDepth, depth + 1, multiline);
            const args = genericType.typeArgs.map((a) => formatTypeInternal(a, maxDepth, depth + 1, multiline)).join(", ");
            return `${base}<${args}>`;
        }

        default:
            return "unknown";
    }
}

// =============================================================================
// TYPE PARSING
// =============================================================================

/**
 * Parse a type string from definition files
 * Examples: "string", "number|nil", "table<string, any>", "fun(x: number): boolean"
 */
export function parseTypeString(typeStr: string): LuaType {
    typeStr = typeStr.trim();

    // Handle union types
    if (typeStr.includes("|") && !typeStr.includes("<")) {
        const parts = typeStr.split("|").map((s) => s.trim());
        return unionType(...parts.map(parseTypeString));
    }

    // Handle optional (ends with ?)
    if (typeStr.endsWith("?")) {
        const base = parseTypeString(typeStr.slice(0, -1));
        return unionType(base, LuaTypes.Nil);
    }

    // Handle array types
    if (typeStr.endsWith("[]")) {
        const elemType = parseTypeString(typeStr.slice(0, -2));
        return arrayType(elemType);
    }

    // Handle variadic
    if (typeStr.endsWith("...")) {
        const elemType = parseTypeString(typeStr.slice(0, -3).trim());
        return variadicType(elemType);
    }

    // Handle table<K, V>
    const tableMatch = typeStr.match(/^table<(.+),\s*(.+)>$/);
    if (tableMatch) {
        const keyType = parseTypeString(tableMatch[1]);
        const valueType = parseTypeString(tableMatch[2]);
        return tableType([], keyType, valueType);
    }

    // Primitive types
    const primitives: Record<string, LuaType> = {
        unknown: LuaTypes.Unknown,
        any: LuaTypes.Any,
        nil: LuaTypes.Nil,
        boolean: LuaTypes.Boolean,
        number: LuaTypes.Number,
        integer: LuaTypes.Integer,
        string: LuaTypes.String,
        table: LuaTypes.Table,
        function: LuaTypes.Function,
        thread: LuaTypes.Thread,
        userdata: LuaTypes.Userdata,
        never: LuaTypes.Never,
        void: LuaTypes.Void,
    };

    if (typeStr.toLowerCase() in primitives) {
        return primitives[typeStr.toLowerCase()];
    }

    // Default to reference type for unknown types
    return refType(typeStr);
}
