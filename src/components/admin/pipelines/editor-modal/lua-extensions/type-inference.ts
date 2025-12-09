// =============================================================================
// LUA TYPE INFERENCE
// =============================================================================
// Parses Lua code to track local variable types for intelligent completions

import * as luaparse from "luaparse";
import type { Chunk, MemberExpression, Identifier } from "luaparse";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type LuaTypeKind =
    | "unknown"
    | "primitive" // string, number, boolean, nil
    | "table"     // { a = 1, b = "c" }
    | "function"  // function(a, b) return c end
    | "union"     // string | nil
    | "global"    // context, helpers, table, string
    | "context"   // context.user, context.request
    | "helper"    // helpers.fetch
    | "module";   // built-in modules like 'string'

export interface LuaType {
    kind: LuaTypeKind;
    name?: string; // "string", "number", "PipelineUser"
    // For tables
    fields?: Map<string, LuaType>;
    // For functions
    params?: LuaType[];
    returns?: LuaType;
    // For unions
    types?: LuaType[];
    // For context/helpers
    contextObject?: string; // "user", "session"
    helperName?: string;    // "fetch", "log"
    // For metatable support
    bases?: LuaType[];
}

export interface VariableType {
    name: string;
    // 'upvalue' is computed dynamically when querying relative to a scope
    kind: "local" | "global" | "parameter" | "function" | "upvalue";
    inferredType: LuaType;
    doc?: LuaDocComment;
    line: number;
    initNode?: LuaNode;
}

/**
 * Format a LuaType as a string for display
 */
export function formatLuaType(t: LuaType, depth = 0): string {
    if (!t) return "unknown";
    if (depth > 3) return "..."; // Increased depth limit

    switch (t.kind) {
        case "primitive":
            return t.name || "any";
        case "table":
            if (t.fields) {
                const fields = Array.from(t.fields.entries())
                    .map(([k, v]) => `${k}: ${formatLuaType(v, depth + 1)}`)
                    .join(", ");
                return `{ ${fields} }`;
            }
            return "table";
        case "function": {
            const params = (t.params || [])
                .map(p => `${p.name || "arg"}: ${formatLuaType(p, depth + 1)}`)
                .join(", ");
            const ret = t.returns ? formatLuaType(t.returns, depth + 1) : "nil";
            return `function(${params}) -> ${ret}`;
        }
        case "union":
            return (t.types || []).map(sub => formatLuaType(sub, depth + 1)).join(" | ");
        case "context":
            return `Context (${t.contextObject || "Global"})`;
        case "global":
            return t.name || "global";
        case "unknown":
        default:
            return "unknown";
    }
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
    /** Refers to ALL variables found anywhere in the code (legacy support) */
    variables: Map<string, VariableType>;
    /** LuaDoc comments for local functions */
    functionDocs?: Map<string, LuaDocComment>;
    parseError?: string;
    /** The root scope of the parsed AST */
    rootScope?: Scope;
}

// =============================================================================
// AST HELPERS
// =============================================================================

export interface LuaNode {
    type: string;
    range?: [number, number];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

// Re-export definitions if needed or import them
import { HELPERS_DEFINITIONS, CONTEXT_FIELDS_UNIVERSAL } from "./definitions";

/**
 * Infer the type of an expression
 */
export function inferExpressionType(
    expr: LuaNode,
    scope?: Scope // Pass scope for lookup
): LuaType {
    if (!expr) return { kind: "unknown" };

    // Literals
    if (expr.type === "StringLiteral") return { kind: "primitive", name: "string" };
    if (expr.type === "NumericLiteral") return { kind: "primitive", name: "number" };
    if (expr.type === "BooleanLiteral") return { kind: "primitive", name: "boolean" };
    if (expr.type === "NilLiteral") return { kind: "primitive", name: "nil" };

    // Function expressions and declarations
    if (expr.type === "FunctionDeclaration" || expr.type === "FunctionExpression") {
        return { kind: "function" };
    }

    // Identifiers (Variable access)
    if (expr.type === "Identifier") {
        if (expr.name === "context") return { kind: "global", name: "context" };
        if (expr.name === "helpers") return { kind: "global", name: "helpers" };

        // Look up variable in scope
        if (scope) {
            const v = scope.get(expr.name);
            return v ? v.inferredType : { kind: "unknown" };
        }
        return { kind: "unknown" };
    }

    // Member expression
    if (expr.type === "MemberExpression") {
        const member = expr as MemberExpression;
        const base = member.base;
        const identifier = member.identifier as Identifier;

        const baseType = inferExpressionType(base, scope);

        // Handle context.xxx
        if (baseType.kind === "global" && baseType.name === "context") {
            const fieldName = identifier.name;
            if (["user", "session", "apikey", "client", "request"].includes(fieldName)) {
                return { kind: "context", contextObject: fieldName };
            }
            if (fieldName === "prev") return { kind: "global", name: "prev" };
            if (fieldName === "outputs") return { kind: "global", name: "outputs" };

            // Heuristic context fields
            const commonFields: Record<string, string> = {
                email: "string", userId: "string", ip: "string", userAgent: "string",
                origin: "string", name: "string", role: "string", trigger_event: "string"
            };
            if (commonFields[fieldName]) return { kind: "primitive", name: commonFields[fieldName] };

            const univField = CONTEXT_FIELDS_UNIVERSAL.find(f => f.name === fieldName);
            if (univField) {
                if (univField.type === "string") return { kind: "primitive", name: "string" };
                if (univField.type.includes("table")) return { kind: "table", name: "table" };
            }
        }

        // Nested context types
        if (baseType.kind === "context" && baseType.contextObject) {
            if (["id", "email", "name", "role"].includes(identifier.name)) {
                return { kind: "primitive", name: "string" };
            }
            return { kind: "unknown" };
        }

        // Table field access
        if (baseType.kind === "table") {
            if (baseType.fields?.has(identifier.name)) {
                return baseType.fields.get(identifier.name)!;
            }
            // Check bases (metatables)
            if (baseType.bases) {
                for (const base of baseType.bases) {
                    if (base.fields?.has(identifier.name)) {
                        return base.fields.get(identifier.name)!;
                    }
                }
            }
        }
    }

    // Call Expression
    if (expr.type === "CallExpression") {
        const base = expr.base;
        if (base.type === "MemberExpression") {
            const member = base as MemberExpression;
            if (member.base.type === "Identifier" && (member.base as Identifier).name === "helpers") {
                const helperName = (member.identifier as Identifier).name;
                const def = HELPERS_DEFINITIONS.find(h => h.name === helperName);
                if (def) {
                    if (helperName === "fetch") {
                        const fields = new Map<string, LuaType>();
                        fields.set("status", { kind: "primitive", name: "number" });
                        fields.set("body", { kind: "primitive", name: "string" });
                        fields.set("headers", { kind: "table", fields: new Map() });
                        return { kind: "table", fields };
                    }
                    if (helperName === "matches") return { kind: "primitive", name: "boolean" };
                    if (helperName === "now") return { kind: "primitive", name: "number" };
                    if (helperName === "hash") return { kind: "primitive", name: "string" };
                    if (helperName === "env") return { kind: "primitive", name: "string" };
                    if (helperName === "secret") return { kind: "primitive", name: "string" };
                }
            }
        }
    }

    // Table constructor
    if (expr.type === "TableConstructorExpression") {
        const fields = new Map<string, LuaType>();
        for (const field of expr.fields || []) {
            if (field.type === "TableKey" || field.type === "TableKeyString") {
                const key = field.key;
                let keyName: string | undefined;
                if (key.type === "Identifier") keyName = key.name;
                else if (key.type === "StringLiteral") keyName = key.value;

                if (keyName) {
                    const valueType = inferExpressionType(field.value, scope);
                    fields.set(keyName, valueType);
                }
            }
        }
        return { kind: "table", fields };
    }

    // Binary / logical expressions
    if (expr.type === "BinaryExpression") {
        if (expr.operator === "..") return { kind: "primitive", name: "string" };
        if (["+", "-", "*", "/", "%", "^", "//", "&", "|", "~", "<<", ">>"].includes(expr.operator)) {
            return { kind: "primitive", name: "number" };
        }
        if (["==", "~=", "<", ">", "<=", ">="].includes(expr.operator)) {
            return { kind: "primitive", name: "boolean" };
        }
        // Fallback
        return { kind: "unknown" };
    }

    if (expr.type === "LogicalExpression") {
        const left = inferExpressionType(expr.left, scope);
        const right = inferExpressionType(expr.right, scope);

        if (expr.operator === "or") {
            if (left.kind === right.kind && left.name === right.name) return left;
            if (left.kind === "primitive" && left.name === "nil") return right;

            const types: LuaType[] = [];
            const addType = (t: LuaType) => {
                if (t.kind === "union") t.types?.forEach(addType);
                else types.push(t);
            };
            addType(left);
            addType(right);
            return { kind: "union", types };
        }
        if (expr.operator === "and") {
            return { kind: "union", types: [left, right] };
        }
    }

    // Vararg literal (...)
    if (expr.type === "VarargLiteral") {
        return { kind: "unknown", name: "..." };
    }

    return { kind: "unknown" };
}

// =============================================================================
// SCOPE MANAGEMENT
// =============================================================================

export interface ScopeRange {
    start: number;
    end: number;
}

export class Scope {
    variables = new Map<string, VariableType>();
    parent: Scope | null;
    range: ScopeRange;
    children: Scope[] = [];

    constructor(range: ScopeRange, parent: Scope | null = null) {
        this.parent = parent;
        this.range = range;
        if (parent) parent.children.push(this);
    }

    add(name: string, type: VariableType) {
        this.variables.set(name, type);
    }

    /** Find a variable in this scope or parents */
    get(name: string): VariableType | undefined {
        return this.variables.get(name) || this.parent?.get(name);
    }

    /** Update variable if it exists in chain */
    update(name: string, updater: (v: VariableType) => VariableType): boolean {
        if (this.variables.has(name)) {
            const v = this.variables.get(name)!;
            this.variables.set(name, updater(v));
            return true;
        }
        if (this.parent) return this.parent.update(name, updater);
        return false;
    }

    /** Flatten variables from this scope UP to root */
    collectVisibleVariables(): Map<string, VariableType> {
        const all = this.parent ? this.parent.collectVisibleVariables() : new Map<string, VariableType>();
        for (const [k, v] of this.variables) {
            all.set(k, {
                ...v,
                // Mark as upvalue if defined in a parent scope
                kind: (this.parent && !this.variables.has(k) && (v.kind === "local" || v.kind === "parameter")) ? "upvalue" : v.kind
            });
        }
        return all;
    }

    /** Find innermost scope covering the given position */
    findScopeAt(pos: number): Scope {
        // Check children
        for (const child of this.children) {
            if (pos >= child.range.start && pos <= child.range.end) {
                return child.findScopeAt(pos);
            }
        }
        // If no child covers it, it's this scope (assuming we already checked this scope covers pos)
        return this;
    }
}

// =============================================================================
// MAIN INFERENCE FUNCTION
// =============================================================================

export function inferVariableTypes(code: string): InferenceResult {
    const docs = parseLuaDocComments(code);
    const allVariables = new Map<string, VariableType>(); // Flat map for legacy consumers

    // Root scope covers entire file
    const rootScope = new Scope({ start: 0, end: code.length });
    let currentScope = rootScope;

    try {
        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true, // IMPORTANT: Needed for scope ranges
            scope: true,
            comments: false,
            luaVersion: "5.3",
        }) as Chunk;

        // Simplified recursive walker
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traverse = (node: any) => {
            if (!node) return;

            let scopePushed = false;
            // Nodes that create a new scope
            // Nodes that create a new scope
            const blockCreatingNodes = ["FunctionDeclaration", "FunctionExpression", "DoStatement", "WhileStatement", "RepeatStatement", "IfStatement", "ForNumericStatement", "ForGenericStatement"];

            if (blockCreatingNodes.includes(node.type)) {
                // If the node has a body block, we could use that, or just use the node's range.
                // Using node's range is safer.
                const range: ScopeRange = node.range ? { start: node.range[0], end: node.range[1] } : { start: 0, end: 0 };
                currentScope = new Scope(range, currentScope);
                scopePushed = true;
            }

            // --- Process Definitions ---

            // Local Statement
            if (node.type === "LocalStatement") {
                const vars = node.variables || [];
                const inits = node.init || [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                vars.forEach((v: any, i: number) => {
                    if (v.type === "Identifier") {
                        const name = v.name;
                        const init = inits[i];
                        const type = inferExpressionType(init, currentScope);
                        const variable: VariableType = {
                            name,
                            kind: "local",
                            inferredType: type,
                            line: v.loc?.start.line || 0,
                            initNode: init
                        };
                        currentScope.add(name, variable);
                        allVariables.set(name, variable);
                    }
                });
            }

            // Assignment
            if (node.type === "AssignmentStatement") {
                const vars = node.variables || [];
                const inits = node.init || [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                vars.forEach((v: any, i: number) => {
                    const init = inits[i];

                    if (v.type === "Identifier") {
                        const name = v.name;
                        // Check if exists in scope chain
                        if (currentScope.get(name)) {
                            const type = inferExpressionType(init, currentScope);
                            if (type.kind !== "unknown") {
                                currentScope.update(name, old => ({ ...old, inferredType: type, initNode: init }));
                                // Update global map too if it's there
                                if (allVariables.has(name)) allVariables.set(name, currentScope.get(name)!);
                            }
                        }
                    } else if (v.type === "MemberExpression") {
                        // Handle t.field = value or t["field"] = value
                        const baseType = inferExpressionType(v.base, currentScope);
                        if (baseType.kind === "table") {
                            let keyName: string | undefined;
                            if (v.identifier.type === "Identifier") keyName = v.identifier.name;
                            // Note: MemberExpression identifier is always Identifier or not? 
                            // luaparse: MemberExpression { base, identifier, indexer }
                            // if indexer is '.', identifier is Identifier. 
                            // if indexer is '[]', identifier is Expression (StringLiteral etc)
                            // Actually luaparse definition: identifier is LuaNode.
                            else if (v.identifier.type === "StringLiteral") keyName = v.identifier.value;

                            if (keyName && baseType.fields) {
                                const valueType = inferExpressionType(init, currentScope);
                                baseType.fields.set(keyName, valueType);
                            }
                        }
                    }
                });
            }

            // Function Declaration or Expression
            if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression") {
                const isLocal = node.isLocal;
                const nameIdentifier = node.identifier;
                const name = nameIdentifier?.name;

                // Handle 'FunctionDeclaration' name binding
                if (node.type === "FunctionDeclaration" && name) {
                    // "local function f()" adds 'f' to enclosing scope (before entering new scope??)
                    // Wait, usually declaration name is visible in outer scope.
                    // But we already pushed a new scope for the function body!
                    // So we must add the function variable to the PARENT scope.
                    const targetScopeForName = isLocal ? (currentScope.parent || currentScope) : rootScope;

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const params = (node.parameters || []).map((p: any) => p.name || p.value) as string[];
                    const doc = docs.get(name);

                    // Reconstruct param types from docs
                    const paramTypes: LuaType[] = params.map(p => ({ kind: "unknown", name: p }));
                    if (doc) {
                        doc.params.forEach((docParam) => {
                            const idx = params.indexOf(docParam.name);
                            if (idx !== -1) {
                                paramTypes[idx] = { kind: "primitive", name: docParam.type }; // Simplification
                            }
                        });
                    }

                    const returnType: LuaType = doc?.returns ? { kind: "primitive", name: doc.returns.type } : { kind: "unknown" };

                    const funcVar: VariableType = {
                        name,
                        kind: isLocal ? "function" : "global",
                        inferredType: { kind: "function", params: paramTypes, returns: returnType },
                        doc,
                        line: nameIdentifier.loc?.start.line || 0,
                        initNode: node
                    };
                    targetScopeForName.add(name, funcVar);
                    allVariables.set(name, funcVar);
                }

                // Handle Parameters (add to CURRENT scope - the function body)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const params = (node.parameters || []).map((p: any) => p.name || p.value) as string[];
                params.forEach((p) => {
                    const paramVar: VariableType = {
                        name: p,
                        kind: "parameter",
                        inferredType: { kind: "unknown", name: "any" },
                        line: node.loc?.start.line || 0, // Fallback if no ident loc
                        initNode: node
                    };
                    currentScope.add(p, paramVar);
                    allVariables.set(p, paramVar);
                });

                // Handle Varargs (...)
                if (node.isVararg) {
                    const varargVar: VariableType = {
                        name: "...",
                        kind: "parameter",
                        inferredType: { kind: "unknown", name: "..." },
                        line: node.loc?.start.line || 0,
                        initNode: node
                    };
                    currentScope.add("...", varargVar);
                }
            }

            // Metatable detection in CallExpression
            if (node.type === "CallExpression") {
                if (node.base.type === "Identifier" && node.base.name === "setmetatable") {
                    const args = node.arguments;
                    if (args && args.length >= 2) {
                        const targetObj = args[0];
                        const metaObj = args[1];

                        // We primarily care if targetObj is an identifier and metaObj is a table literal with __index
                        if (targetObj.type === "Identifier") {
                            const targetName = targetObj.name;
                            const targetVar = currentScope.get(targetName);

                            if (targetVar && targetVar.inferredType.kind === "table") {
                                // Inspect metaObj
                                if (metaObj.type === "TableConstructorExpression") {
                                    // Look for __index field
                                    const fields = metaObj.fields || [];
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const indexField = fields.find((f: any) =>
                                        (f.type === "TableKey" || f.type === "TableKeyString") &&
                                        (f.key.name === "__index" || f.key.value === "__index")
                                    );

                                    if (indexField) {
                                        const indexValueType = inferExpressionType(indexField.value, currentScope);
                                        if (indexValueType.kind === "table") {
                                            // Set as base!
                                            // We need to modify the existing Type object in memory
                                            if (!targetVar.inferredType.bases) targetVar.inferredType.bases = [];
                                            targetVar.inferredType.bases.push(indexValueType);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // For Generic Statement (for k, v in pairs(t))
            if (node.type === "ForGenericStatement") {
                const vars = node.variables || [];
                const iterators = node.iterators || [];

                // Try to interpret the iterator
                let keyType: LuaType = { kind: "unknown" };
                let valueType: LuaType = { kind: "unknown" };

                if (iterators.length > 0 && iterators[0].type === "CallExpression") {
                    const call = iterators[0];
                    if (call.base.type === "Identifier") {
                        const funcName = call.base.name;
                        const args = call.arguments || [];
                        if (args.length > 0) {
                            const targetType = inferExpressionType(args[0], currentScope);

                            if (funcName === "pairs" && targetType.kind === "table") {
                                // pairs: key is unknown/string, value is known (union of field types? or unknown)
                                // Simple approach: if table has fields, try to union them?
                                // For now: key=string, value=unknown
                                keyType = { kind: "primitive", name: "string" };
                                valueType = { kind: "unknown" };

                                // Advanced: If table has well defined fields, v is union of them.
                                if (targetType.fields && targetType.fields.size > 0) {
                                    // Create union of all field values
                                    const types: LuaType[] = Array.from(targetType.fields.values());
                                    // Dedupe would be good
                                    if (types.length === 1) valueType = types[0];
                                    else valueType = { kind: "union", types };
                                }
                            } else if (funcName === "ipairs" && targetType.kind === "table") {
                                // ipairs: key=number, value=unknown
                                keyType = { kind: "primitive", name: "number" };
                                // Similar logic for value type if it's an array-like table
                                // But we don't track array element types explicitly yet (just fields)
                            }
                        }
                    }
                }

                // Assign types to variables
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                vars.forEach((v: any, i: number) => {
                    if (v.type === "Identifier") {
                        let type = { kind: "unknown" } as LuaType;
                        if (i === 0) type = keyType;
                        if (i === 1) type = valueType;

                        const variable: VariableType = {
                            name: v.name,
                            kind: "local",
                            inferredType: type,
                            line: v.loc?.start.line || 0,
                            initNode: node
                        };
                        currentScope.add(v.name, variable);
                        allVariables.set(v.name, variable);
                    }
                });
            }

            // --- Traverse children ---
            if (node.body) {
                if (Array.isArray(node.body)) node.body.forEach(traverse);
                else traverse(node.body);
            }
            if (node.clauses) node.clauses.forEach(traverse);
            if (node.expression) traverse(node.expression);
            if (node.base) traverse(node.base);
            if (node.arguments) node.arguments.forEach(traverse);
            if (node.fields) node.fields.forEach(traverse);
            if (node.key) traverse(node.key);
            if (node.value) traverse(node.value);
            if (node.variables) node.variables.forEach(traverse);
            if (node.init) node.init.forEach(traverse);
            if (node.left) traverse(node.left);
            if (node.right) traverse(node.right);
            if (node.operand) traverse(node.operand);
            if (node.block) traverse(node.block);
            if (node.variable) traverse(node.variable);
            if (node.start) traverse(node.start);
            if (node.end) traverse(node.end);
            if (node.step) traverse(node.step);
            if (node.iterators) node.iterators.forEach(traverse);

            if (scopePushed) {
                currentScope = currentScope.parent!;
            }
        };

        traverse(ast);

        return { variables: allVariables, functionDocs: docs, rootScope };
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Parse error";
        return { variables: allVariables, parseError: msg, rootScope };
    }
}


/**
 * Find the AST node at a specific position
 */
export function findNodeAtPosition(node: LuaNode, pos: number): LuaNode | null {
    if (!node || !node.range) return null;
    const [start, end] = node.range;
    if (pos < start || pos > end) return null;

    // Check children (more specific first)
    // We need to iterate over all keys
    for (const key in node) {
        if (Object.prototype.hasOwnProperty.call(node, key)) {
            const child = node[key];
            if (Array.isArray(child)) {
                for (const c of child) {
                    if (c && typeof c === "object" && c.type) {
                        const found = findNodeAtPosition(c, pos);
                        if (found) return found;
                    }
                }
            } else if (child && typeof child === "object" && child.type) {
                const found = findNodeAtPosition(child, pos);
                if (found) return found;
            }
        }
    }
    return node;
}

/**
 * Resolve context for a table key at a position
 */
export function resolveTableKeyAtPosition(code: string, pos: number): { name: string; type: LuaType } | null {
    try {
        const { rootScope } = inferVariableTypes(code);
        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true,
            luaVersion: "5.3",
        }) as Chunk;

        const node = findNodeAtPosition(ast, pos);
        if (!node) return null;

        // Check if node is a TableKeyString (e.g. { a = 1 }) or TableKey
        if (node.type === "TableKeyString" && node.key && node.key.type === "Identifier") {
            // Check if pos is within the key
            const [kStart, kEnd] = node.key.range!;
            if (pos >= kStart && pos <= kEnd) {
                // It's the key. Infer the value.
                // We need the scope at this position to correctly infer the value if it references variables
                const scope = rootScope?.findScopeAt(pos);
                const type = inferExpressionType(node.value, scope);
                return { name: node.key.name, type };
            }
        }

        // Also check if we are just on the identifier of the TableKeyString (if findNode went deep)
        if (node.type === "Identifier") {
            // We don't have parent pointer easily here without walking with parent stack.
            // But we can rely on findNodeAtPosition returning the deepest node.
            // A TableKeyString structure is: { type: "TableKeyString", key: Identifier, value: Expression }
            // So findNodeAtPosition will return the Identifier, NOT the TableKeyString.
            // We need parent pointers.
        }

        // Let's rewrite findNodeAtPosition to return path or handle the check better.
        // Or simpler: Use a visitor pattern that looks for TableKeyString and checks if we are in its key.

        let foundKey: { name: string; type: LuaType } | null = null;

        const visit = (n: LuaNode) => {
            if (foundKey) return;

            if (n.type === "TableKeyString" && n.key && n.key.type === "Identifier") {
                const [kStart, kEnd] = n.key.range!;
                if (pos >= kStart && pos <= kEnd) {
                    const scope = rootScope?.findScopeAt(pos);
                    const type = inferExpressionType(n.value, scope);
                    foundKey = { name: n.key.name, type };
                    return;
                }
            }

            // Recurse
            for (const key in n) {
                if (key === 'parent') continue;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const child = (n as any)[key];
                if (Array.isArray(child)) {
                    child.forEach(c => { if (c && typeof c === "object" && c.type) visit(c); });
                } else if (child && typeof child === "object" && child.type) {
                    visit(child);
                }
            }
        };

        visit(ast);
        return foundKey;

    } catch {
        return null;
    }
}

export function getVariablesInScope(code: string, pos: number): Map<string, VariableType> {
    const { rootScope } = inferVariableTypes(code);
    if (!rootScope) return new Map();

    const targetScope = rootScope.findScopeAt(pos);

    // Walk up the scope chain to collect all visible variables
    const visibleVars = new Map<string, VariableType>();

    let current: Scope | null = targetScope;
    while (current) {
        for (const [name, variable] of current.variables) {
            if (!visibleVars.has(name)) { // Inner hides outer
                // Check if this is an upvalue (variable defined in a parent function)
                let dynamicKind = variable.kind;
                if (current !== targetScope && (variable.kind === "local" || variable.kind === "parameter")) {
                    dynamicKind = "upvalue";
                }

                visibleVars.set(name, { ...variable, kind: dynamicKind });
            }
        }
        current = current.parent;
    }

    return visibleVars;
}

// =============================================================================
// EXTRACT RETURN SCHEMA FROM SCRIPT
// =============================================================================

export interface ReturnSchema {
    fields: string[];
    dataFields?: string[];
}

function resolveExpressionFields(
    expr: LuaNode,
    variables: Map<string, VariableType>, // NOTE: This needs to be scope-aware ideally, but for now using flat
    visited = new Set<string>()
): { fields: string[]; dataFields: string[] } {
    const fields: string[] = [];
    let dataFields: string[] = [];

    if (!expr) return { fields, dataFields };

    if (expr.type === "TableConstructorExpression") {
        for (const field of expr.fields || []) {
            if (field.type === "TableKey" || field.type === "TableKeyString") {
                const key = field.key;
                let fieldName: string | null = null;
                if (key.type === "Identifier") fieldName = key.name;
                else if (key.type === "StringLiteral") fieldName = key.value;

                if (fieldName) {
                    fields.push(fieldName);
                    if (fieldName === "data") {
                        const result = resolveExpressionFields(field.value, variables, visited);
                        dataFields = result.fields;
                    }
                }
            }
        }
    } else if (expr.type === "Identifier") {
        const varName = expr.name;
        if (!visited.has(varName)) {
            visited.add(varName);
            const varInfo = variables.get(varName);
            if (varInfo?.initNode) {
                return resolveExpressionFields(varInfo.initNode, variables, visited);
            } else if (varInfo?.inferredType?.kind === "table" && varInfo.inferredType.fields) {
                return {
                    fields: Array.from(varInfo.inferredType.fields.keys()),
                    dataFields: []
                };
            }
        }
    }

    return { fields, dataFields };
}

export function extractReturnSchema(code: string): ReturnSchema | null {
    try {
        const { variables } = inferVariableTypes(code); // Flat vars is fine for return schema generally
        const ast = luaparse.parse(code, { locations: true, ranges: true, luaVersion: "5.3" }) as Chunk;

        const allFields = new Set<string>();
        const allDataFields = new Set<string>();

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

export function parseLuaDocComments(code: string): Map<string, LuaDocComment> {
    const docs = new Map<string, LuaDocComment>();
    const lines = code.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const funcMatch = line.match(/^local\s+function\s+(\w+)\s*\(/);
        if (!funcMatch) continue;

        const funcName = funcMatch[1];
        const funcLine = i + 1;
        let description: string | undefined;
        const params: Array<{ name: string; type: string; description: string }> = [];
        let returns: { type: string; description: string } | undefined;

        let j = i - 1;
        while (j >= 0 && lines[j].trim().startsWith("---")) {
            const commentLine = lines[j].trim();
            const paramMatch = commentLine.match(/^---\s*@param\s+(\w+)\s+(\w+)\s*(.*)?$/);
            if (paramMatch) {
                params.unshift({ name: paramMatch[1], type: paramMatch[2], description: paramMatch[3]?.trim() || "" });
                j--; continue;
            }
            const returnMatch = commentLine.match(/^---\s*@return\s+(\w+)\s*(.*)?$/);
            if (returnMatch) {
                returns = { type: returnMatch[1], description: returnMatch[2]?.trim() || "" };
                j--; continue;
            }
            const descMatch = commentLine.match(/^---\s*([^@].*)$/);
            if (descMatch) {
                description = descMatch[1].trim() + (description ? " " + description : "");
            }
            j--;
        }
        if (description || params.length > 0 || returns) {
            docs.set(funcName, { name: funcName, line: funcLine, description, params, returns });
        }
    }
    return docs;
}

function walkAST(node: LuaNode, callback: (node: LuaNode) => void): void {
    if (!node || typeof node !== "object") return;
    callback(node);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyNode = node as any;
    for (const key in anyNode) {
        if (Object.prototype.hasOwnProperty.call(anyNode, key)) {
            const child = anyNode[key];
            if (Array.isArray(child)) {
                child.forEach((c) => {
                    if (c && typeof c === "object" && c.type) walkAST(c, callback);
                });
            } else if (child && typeof child === "object" && child.type) {
                walkAST(child, callback);
            }
        }
    }
}
