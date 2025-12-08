// =============================================================================
// LUA TYPE INFERENCE
// =============================================================================
// Parses Lua code to track local variable types for intelligent completions

import * as luaparse from "luaparse";
import type { Chunk, LocalStatement, AssignmentStatement, MemberExpression, Identifier } from "luaparse";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface VariableType {
    name: string;
    type: "unknown" | "helpers" | "context" | "nestedContext" | "table" | "prev" | "outputs" | "function";
    /** For nested context types, the specific object (user, session, etc.) */
    contextObject?: string;
    /** For table literals, the known fields */
    tableFields?: string[];
    /** For functions, the parameter names */
    functionParams?: string[];
    /** Documentation for the variable/function */
    doc?: LuaDocComment;
    /** The line where this variable was defined */
    line: number;
    /** The AST node of the initialization expression */
    initNode?: LuaNode;
}

/**
 * LuaDoc-style comment parsed from annotations above functions
 */
export interface LuaDocComment {
    /** Function name */
    name: string;
    /** Line number where function is defined */
    line: number;
    /** Description from --- comment */
    description?: string;
    /** @param annotations */
    params: Array<{ name: string; type: string; description: string }>;
    /** @return annotation */
    returns?: { type: string; description: string };
}

export interface InferenceResult {
    variables: Map<string, VariableType>;
    /** LuaDoc comments for local functions */
    functionDocs?: Map<string, LuaDocComment>;
    parseError?: string;
}

// =============================================================================
// AST HELPERS
// =============================================================================

interface LuaNode {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

/**
 * Infer the type of an expression
 */
function inferExpressionType(expr: LuaNode): Partial<VariableType> {
    if (!expr) return { type: "unknown" };

    // Direct context access: local ctx = context
    if (expr.type === "Identifier") {
        if (expr.name === "context") return { type: "context" };
        if (expr.name === "helpers") return { type: "helpers" };
        return { type: "unknown" };
    }

    // Member expression: context.user, context.prev, helpers.log
    if (expr.type === "MemberExpression") {
        const member = expr as MemberExpression;
        const base = member.base;
        const identifier = member.identifier as Identifier;

        if (base.type === "Identifier") {
            const baseName = (base as Identifier).name;

            // context.xxx
            if (baseName === "context") {
                const fieldName = identifier.name;

                // context.user, context.session, etc.
                if (["user", "session", "apikey", "client", "request"].includes(fieldName)) {
                    return { type: "nestedContext", contextObject: fieldName };
                }

                // context.prev
                if (fieldName === "prev") {
                    return { type: "prev" };
                }

                // context.outputs
                if (fieldName === "outputs") {
                    return { type: "outputs" };
                }
            }
        }
    }

    // Table constructor: local t = { a = 1, b = 2 }
    if (expr.type === "TableConstructorExpression") {
        const fields: string[] = [];
        for (const field of expr.fields || []) {
            if (field.type === "TableKey" || field.type === "TableKeyString") {
                const key = field.key;
                if (key.type === "Identifier") {
                    fields.push(key.name);
                } else if (key.type === "StringLiteral") {
                    fields.push(key.value);
                }
            }
        }
        return { type: "table", tableFields: fields };
    }

    return { type: "unknown" };
}

// =============================================================================
// MAIN INFERENCE FUNCTION
// =============================================================================

/**
 * Analyze Lua code to extract local variable type information
 */
export function inferVariableTypes(code: string): InferenceResult {
    const variables = new Map<string, VariableType>();

    // Parse docs first
    const docs = parseLuaDocComments(code);

    // First, try regex-based extraction (works with incomplete code)
    // First, try regex-based extraction (works with incomplete code)
    extractLocalVariablesWithRegex(code, variables, docs);

    // Then try AST-based extraction for more accurate type info
    try {
        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true,
            scope: true,
            comments: false,
            luaVersion: "5.3",
        }) as Chunk;

        // Walk the AST to find local variable declarations
        walkAST(ast, (node: LuaNode) => {
            // Local statement: local x = expr
            if (node.type === "LocalStatement") {
                const stmt = node as unknown as LocalStatement;
                const vars = stmt.variables || [];
                const inits = stmt.init || [];

                for (let i = 0; i < vars.length; i++) {
                    const varNode = vars[i];
                    if (varNode.type === "Identifier") {
                        const name = varNode.name;
                        const initExpr = inits[i];

                        // Try to infer type from init expression
                        const typeInfo = inferExpressionType(initExpr);

                        // Only update if we got a more specific type
                        const existing = variables.get(name);
                        if (!existing || typeInfo.type !== "unknown") {
                            variables.set(name, {
                                name,
                                type: typeInfo.type || "unknown",
                                contextObject: typeInfo.contextObject,
                                tableFields: typeInfo.tableFields,
                                line: varNode.loc?.start?.line || 0,
                                initNode: initExpr,
                            });
                        }
                    }
                }
            }

            // Assignment statement: x = expr (only track if already local)
            if (node.type === "AssignmentStatement") {
                const stmt = node as unknown as AssignmentStatement;
                const vars = stmt.variables || [];
                const inits = stmt.init || [];

                for (let i = 0; i < vars.length; i++) {
                    const varNode = vars[i];
                    if (varNode.type === "Identifier") {
                        const name = (varNode as Identifier).name;
                        // Only update if already tracked
                        if (variables.has(name)) {
                            const initExpr = inits[i];
                            const typeInfo = inferExpressionType(initExpr);
                            if (typeInfo.type !== "unknown") {
                                variables.set(name, {
                                    name,
                                    type: typeInfo.type || "unknown",
                                    contextObject: typeInfo.contextObject,
                                    tableFields: typeInfo.tableFields,
                                    line: varNode.loc?.start?.line || 0,
                                    initNode: initExpr,
                                });
                            }
                        }
                    }
                }
            }

            // Function Declaration: local function name(args) ...
            if (node.type === "FunctionDeclaration") {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const func = node as unknown as any;
                if (func.identifier && func.identifier.type === "Identifier") {
                    const name = func.identifier.name;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const params = (func.parameters || []).map((p: any) => p.name || p.value);
                    const doc = docs.get(name);

                    variables.set(name, {
                        name,
                        type: "function",
                        functionParams: params,
                        doc,
                        line: func.identifier.loc?.start?.line || 0,
                        initNode: node
                    });
                }
            }
        });

        return { variables, functionDocs: docs };
    } catch (e) {
        // AST parsing failed, but we still have regex-extracted variables
        return {
            variables,
            parseError: e instanceof Error ? e.message : "Parse error",
        };
    }
}

/**
 * Extract local variables using regex (works with incomplete/invalid code)
 */
function extractLocalVariablesWithRegex(code: string, variables: Map<string, VariableType>, docs?: Map<string, LuaDocComment>): void {
    // 1. Match local functions: local function name(args)
    const localFuncPattern = /\blocal\s+function\s+(\w+)(?:\s*\(([^)]*)\))?/g;
    let funcMatch;
    while ((funcMatch = localFuncPattern.exec(code)) !== null) {
        const name = funcMatch[1];
        const paramsStr = funcMatch[2];
        const params = paramsStr ? paramsStr.split(",").map(p => p.trim()).filter(p => p) : [];
        const doc = docs?.get(name);

        variables.set(name, {
            name,
            type: "function",
            functionParams: params,
            doc,
            line: 0,
        });
    }

    // 2. Match regular locals: "local name", "local name =", "local name, name2 ="
    // Exclude "local function" to prevent capturing "function" as a variable name
    const localPattern = /\blocal\s+(?!function\b)(\w+(?:\s*,\s*\w+)*)/g;
    let match;

    while ((match = localPattern.exec(code)) !== null) {
        const names = match[1].split(/\s*,\s*/);
        for (const name of names) {
            const trimmed = name.trim();
            if (trimmed && !variables.has(trimmed)) {
                // Try to detect type from assignment
                const afterMatch = code.slice(match.index);
                let inferredType: VariableType["type"] = "unknown";
                let contextObject: string | undefined;
                let tableFields: string[] | undefined;

                // Check for context.xxx assignment
                if (afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*context\\.(user|session|apikey|client|request)`))) {
                    const objMatch = afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*context\\.(user|session|apikey|client|request)`));
                    if (objMatch) {
                        inferredType = "nestedContext";
                        contextObject = objMatch[1];
                    }
                } else if (afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*context\\.prev`))) {
                    inferredType = "prev";
                } else if (afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*context\\.outputs`))) {
                    inferredType = "outputs";
                } else if (afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*context(?![.])`))) {
                    inferredType = "context";
                } else if (afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*helpers(?![.])`))) {
                    inferredType = "helpers";
                } else {
                    // Check for table literal: local t = { a = 1, b = "test" }
                    const tableMatch = afterMatch.match(new RegExp(`${trimmed}\\s*=\\s*\\{([^}]*)\\}`));
                    if (tableMatch) {
                        inferredType = "table";
                        tableFields = extractTableFieldsFromLiteral(tableMatch[1]);
                    }
                }

                variables.set(trimmed, {
                    name: trimmed,
                    type: inferredType,
                    contextObject,
                    tableFields,
                    line: 0,
                });
            }
        }
    }
}

/**
 * Extract field names from a table literal string like "a = 1, b = 'test', c = true"
 */
function extractTableFieldsFromLiteral(tableContent: string): string[] {
    const fields: string[] = [];
    // Match field = value patterns
    const fieldPattern = /(\w+)\s*=/g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(tableContent)) !== null) {
        fields.push(fieldMatch[1]);
    }
    return fields;
}

// =============================================================================
// AST WALKER
// =============================================================================

function walkAST(node: LuaNode, callback: (node: LuaNode) => void): void {
    if (!node || typeof node !== "object") return;

    callback(node);

    const childKeys = [
        "body", "init", "base", "identifier", "argument", "arguments",
        "expression", "expressions", "variables", "values", "clauses",
        "condition", "consequent", "start", "end", "step", "iterators",
        "parameters", "fields", "key", "value",
    ];

    for (const key of childKeys) {
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach((c) => walkAST(c, callback));
        } else if (child && typeof child === "object" && child.type) {
            walkAST(child, callback);
        }
    }
}

// =============================================================================
// EXTRACT RETURN SCHEMA FROM SCRIPT
// =============================================================================

export interface ReturnSchema {
    fields: string[];
    dataFields?: string[];
}

/**
 * Resolve fields from an expression, handling recursion for variables
 */
function resolveExpressionFields(
    expr: LuaNode,
    variables: Map<string, VariableType>,
    visited = new Set<string>()
): { fields: string[]; dataFields: string[] } {
    const fields: string[] = [];
    let dataFields: string[] = [];

    if (!expr) return { fields, dataFields };

    // Case 1: Inline Table { a = 1, data = { ... } }
    if (expr.type === "TableConstructorExpression") {
        for (const field of expr.fields || []) {
            if (field.type === "TableKey" || field.type === "TableKeyString") {
                const key = field.key;
                let fieldName: string | null = null;

                if (key.type === "Identifier") {
                    fieldName = key.name;
                } else if (key.type === "StringLiteral") {
                    fieldName = key.value;
                }

                if (fieldName) {
                    fields.push(fieldName);

                    // If this is the "data" field
                    if (fieldName === "data") {
                        // Recursively resolve data value
                        const result = resolveExpressionFields(field.value, variables, visited);
                        // If the value itself is a table, its fields are the data fields
                        if (field.value?.type === "TableConstructorExpression") {
                            // Direct table: data = { x = 1 } -> result.fields is ["x"]
                            dataFields = result.fields;
                        } else {
                            // Variable reference: data = d
                            // If resolveExpressionFields returns fields, those are the data fields
                            dataFields = result.fields;
                        }
                    }
                }
            }
        }
    }
    // Case 2: Identifier (Variable Reference)
    else if (expr.type === "Identifier") {
        const varName = expr.name;
        if (!visited.has(varName)) {
            visited.add(varName);
            const varInfo = variables.get(varName);
            if (varInfo?.initNode) {
                // Recursively resolve the variable's initialization
                return resolveExpressionFields(varInfo.initNode, variables, visited);
            } else if (varInfo?.tableFields) {
                // Fallback to tableFields if initNode missing
                return { fields: varInfo.tableFields, dataFields: [] };
            }
        }
    }

    return { fields, dataFields };
}

/**
 * Extract the schema of return statements from a script
 * Used for context.prev autocomplete in downstream scripts
 */
export function extractReturnSchema(code: string): ReturnSchema | null {
    try {
        // First, infer variable types so we can resolve identifiers
        const { variables } = inferVariableTypes(code);

        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true,
            luaVersion: "5.3",
        }) as Chunk;

        const allFields = new Set<string>();
        const allDataFields = new Set<string>();

        // Find return statements
        walkAST(ast, (node: LuaNode) => {
            if (node.type === "ReturnStatement") {
                const args = node.arguments || [];
                if (args.length > 0) {
                    const result = resolveExpressionFields(args[0], variables);
                    result.fields.forEach((f) => allFields.add(f));
                    result.dataFields.forEach((f) => allDataFields.add(f));
                }
            }
        });

        if (allFields.size === 0) return null;

        return {
            fields: Array.from(allFields),
            dataFields: allDataFields.size > 0 ? Array.from(allDataFields) : undefined,
        };
    } catch {
        return null;
    }
}

// =============================================================================
// LUADOC COMMENT PARSING
// =============================================================================

/**
 * Parse LuaDoc-style comments from code.
 * Supports:
 * - `---` descriptions
 * - `--- @param name type description`
 * - `--- @return type description`
 */
export function parseLuaDocComments(code: string): Map<string, LuaDocComment> {
    const docs = new Map<string, LuaDocComment>();
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for function declarations
        const funcMatch = line.match(/^local\s+function\s+(\w+)\s*\(/);
        if (!funcMatch) continue;

        const funcName = funcMatch[1];
        const funcLine = i + 1; // 1-indexed

        // Look backwards for doc comments
        let description: string | undefined;
        const params: Array<{ name: string; type: string; description: string }> = [];
        let returns: { type: string; description: string } | undefined;

        let j = i - 1;
        while (j >= 0 && lines[j].trim().startsWith("---")) {
            const commentLine = lines[j].trim();

            // @param annotation
            const paramMatch = commentLine.match(/^---\s*@param\s+(\w+)\s+(\w+)\s*(.*)?$/);
            if (paramMatch) {
                params.unshift({
                    name: paramMatch[1],
                    type: paramMatch[2],
                    description: paramMatch[3]?.trim() || "",
                });
                j--;
                continue;
            }

            // @return annotation
            const returnMatch = commentLine.match(/^---\s*@return\s+(\w+)\s*(.*)?$/);
            if (returnMatch) {
                returns = {
                    type: returnMatch[1],
                    description: returnMatch[2]?.trim() || "",
                };
                j--;
                continue;
            }

            // Description (--- without @)
            const descMatch = commentLine.match(/^---\s*([^@].*)$/);
            if (descMatch) {
                description = descMatch[1].trim() + (description ? " " + description : "");
            }

            j--;
        }

        // Only add if we found at least some documentation
        if (description || params.length > 0 || returns) {
            docs.set(funcName, {
                name: funcName,
                line: funcLine,
                description,
                params,
                returns,
            });
        }
    }

    return docs;
}
