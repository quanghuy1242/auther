// =============================================================================
// RETURN TYPE EXTRACTION
// =============================================================================
// Utilities for extracting return types from Lua script code.
// Used to infer the type of context.outputs["id"] and context.prev.

import { LuaDocument } from "../core/document";
import {
    LuaType,
    LuaTypes,
    LuaTypeKind,
    LuaTableType,
    tableType,
} from "./type-system";

/**
 * Extract the return type from a Lua script's code.
 * Parses the script and analyzes its return statements.
 *
 * @param code - The Lua source code
 * @returns The inferred return type, or Unknown if not determinable
 */
export function extractReturnType(code: string): LuaType {
    if (!code || code.trim() === "") {
        return LuaTypes.Unknown;
    }

    try {
        const doc = new LuaDocument("temp://extract", code);
        const ast = doc.getAST();

        if (!ast || !ast.body) {
            return LuaTypes.Unknown;
        }

        // Find all return statements
        const returns = findReturnStatements(ast.body);

        if (returns.length === 0) {
            return LuaTypes.Nil;
        }

        // Use the last return statement (most likely the main return)
        const lastReturn = returns[returns.length - 1];

        if (!lastReturn.arguments || lastReturn.arguments.length === 0) {
            return LuaTypes.Nil;
        }

        // Infer type from the first return argument
        return inferLiteralType(lastReturn.arguments[0]);
    } catch {
        return LuaTypes.Unknown;
    }
}

/**
 * Extract the 'data' field type from a script's return value.
 * Scripts return { allowed, error?, data? }, we want the data part.
 *
 * @param code - The Lua source code
 * @returns The type of the 'data' field, or Unknown
 */
export function extractReturnDataType(code: string): LuaType {
    const returnType = extractReturnType(code);

    if (returnType.kind === LuaTypeKind.TableType) {
        const tbl = returnType as LuaTableType;
        const dataField = tbl.fields?.get("data");
        if (dataField) {
            return dataField.type;
        }
    }

    return LuaTypes.Unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findReturnStatements(statements: any[]): any[] {
    const returns: unknown[] = [];

    for (const stmt of statements) {
        if (stmt.type === "ReturnStatement") {
            returns.push(stmt);
        }

        // Recursively search in blocks
        if (stmt.body) {
            returns.push(...findReturnStatements(stmt.body));
        }
        if (stmt.clauses) {
            for (const clause of stmt.clauses) {
                if (clause.body) {
                    returns.push(...findReturnStatements(clause.body));
                }
            }
        }
    }

    return returns;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferLiteralType(expr: any): LuaType {
    if (!expr) return LuaTypes.Unknown;

    switch (expr.type) {
        case "NilLiteral":
            return LuaTypes.Nil;
        case "BooleanLiteral":
            return LuaTypes.Boolean;
        case "NumericLiteral":
            return LuaTypes.Number;
        case "StringLiteral":
            return LuaTypes.String;
        case "TableConstructorExpression":
            return inferTableConstructorType(expr);
        default:
            return LuaTypes.Unknown;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferTableConstructorType(expr: any): LuaType {
    const fields: Array<{ name: string; type: LuaType; optional?: boolean }> =
        [];

    if (expr.fields) {
        for (const field of expr.fields) {
            // Only handle key-value pairs (not array entries)
            if (field.type === "TableKeyString" && field.key) {
                const name =
                    field.key.type === "Identifier"
                        ? field.key.name
                        : field.key.raw || String(field.key.value);

                const type = inferLiteralType(field.value);
                fields.push({ name, type });
            }
        }
    }

    return tableType(fields);
}
