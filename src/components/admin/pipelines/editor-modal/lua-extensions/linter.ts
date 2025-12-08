// =============================================================================
// LUA LINTER / DIAGNOSTICS
// =============================================================================
// Uses luaparse to provide syntax errors, disabled global detection, and more

import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import * as luaparse from "luaparse";
import {
    DISABLED_GLOBALS,
    DISABLED_GLOBAL_MESSAGES,
    RETURN_TYPES,
    type ReturnTypeInfo,
} from "./definitions";
import type { HookExecutionMode } from "@/schemas/pipelines";

// =============================================================================
// AST TYPES (from luaparse)
// =============================================================================

interface LuaNode {
    type: string;
    range?: [number, number];
    loc?: {
        start: { line: number; column: number };
        end: { line: number; column: number };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

interface LuaAST {
    type: "Chunk";
    body: LuaNode[];
    range?: [number, number];
}

// =============================================================================
// AST WALKER
// =============================================================================

function walkAST(node: LuaNode, callback: (node: LuaNode) => void): void {
    if (!node || typeof node !== "object") return;

    callback(node);

    // Walk child nodes based on type
    const childKeys = [
        "body",
        "init",
        "base",
        "identifier",
        "argument",
        "arguments",
        "expression",
        "expressions",
        "variables",
        "values",
        "clauses",
        "condition",
        "consequent",
        "start",
        "end",
        "step",
        "iterators",
        "parameters",
    ];

    for (const key of childKeys) {
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach((c: LuaNode) => walkAST(c, callback));
        } else if (child && typeof child === "object" && child.type) {
            walkAST(child, callback);
        }
    }
}

// =============================================================================
// SYNTAX ERROR DETECTION
// =============================================================================

function parseLuaCode(code: string): { ast: LuaAST | null; syntaxError: Diagnostic | null } {
    try {
        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true,
            scope: true,
            comments: false,
            luaVersion: "5.3",
        }) as LuaAST;

        return { ast, syntaxError: null };
    } catch (e: unknown) {
        const error = e as { index?: number; line?: number; column?: number; message?: string };

        // Parse error position
        const from = error.index ?? 0;
        const to = from + 1;

        // Clean up error message
        let message = error.message || "Syntax error";
        // Remove the position info that luaparse adds
        message = message.replace(/\s*\[\d+:\d+\]\s*$/, "").trim();

        return {
            ast: null,
            syntaxError: {
                from,
                to,
                severity: "error",
                message,
                source: "lua-syntax",
            },
        };
    }
}

// =============================================================================
// DISABLED GLOBAL DETECTION
// =============================================================================

function findDisabledGlobals(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const disabledSet = new Set(DISABLED_GLOBALS);

    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        // Check for direct identifier usage (e.g., `os` in `os.exit()`)
        if (node.type === "Identifier" && disabledSet.has(node.name)) {
            const [from, to] = node.range || [0, 0];
            const message = DISABLED_GLOBAL_MESSAGES[node.name] || `'${node.name}' is disabled in the sandbox`;

            diagnostics.push({
                from,
                to,
                severity: "error",
                message,
                source: "lua-sandbox",
            });
        }
    });

    return diagnostics;
}

// =============================================================================
// RETURN STATEMENT VALIDATION
// =============================================================================

function validateReturnStatements(
    ast: LuaAST,
    executionMode: HookExecutionMode
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const returnInfo: ReturnTypeInfo = RETURN_TYPES[executionMode];

    // For async mode, no return is required
    if (executionMode === "async") {
        return diagnostics;
    }

    let hasReturn = false;

    // Find all top-level return statements
    for (const statement of ast.body) {
        if (statement.type === "ReturnStatement") {
            hasReturn = true;
            validateReturnShape(statement, returnInfo, diagnostics);
        }
    }

    // Also check returns inside if/else blocks at top level
    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        if (node.type === "ReturnStatement") {
            hasReturn = true;
        }
    });

    // Warn if no return statement for blocking/enrichment
    if (!hasReturn && returnInfo.requiredFields.length > 0) {
        diagnostics.push({
            from: 0,
            to: Math.min(10, ast.range?.[1] ?? 10),
            severity: "warning",
            message: `${executionMode} hooks should return ${returnInfo.example}`,
            source: "lua-return",
        });
    }

    return diagnostics;
}

function validateReturnShape(
    returnNode: LuaNode,
    returnInfo: ReturnTypeInfo,
    diagnostics: Diagnostic[]
): void {
    const args = returnNode.arguments;

    // No return value
    if (!args || args.length === 0) {
        if (returnInfo.requiredFields.length > 0) {
            const [from, to] = returnNode.range || [0, 0];
            diagnostics.push({
                from,
                to,
                severity: "warning",
                message: `Expected return ${returnInfo.example}`,
                source: "lua-return",
            });
        }
        return;
    }

    // Check if returning a table constructor
    const returnValue = args[0];
    if (returnValue.type !== "TableConstructorExpression") {
        // Returning something other than a table - might be a variable
        // We can't fully validate this without runtime analysis
        return;
    }

    // Check for required fields in table
    const fields = returnValue.fields || [];
    const fieldNames = new Set<string>();

    for (const field of fields) {
        if (field.type === "TableKey" || field.type === "TableKeyString") {
            const key = field.key;
            if (key.type === "Identifier" || key.type === "StringLiteral") {
                fieldNames.add(key.name || key.value);
            }
        }
    }

    // Check for missing required fields
    for (const required of returnInfo.requiredFields) {
        if (!fieldNames.has(required)) {
            const [from, to] = returnNode.range || [0, 0];
            diagnostics.push({
                from,
                to,
                severity: "warning",
                message: `Missing required field '${required}' in return value`,
                source: "lua-return",
            });
        }
    }
}

// =============================================================================
// UNDEFINED VARIABLE DETECTION (Basic)
// =============================================================================

function findUndefinedVariables(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const definedVariables = new Set<string>(["helpers", "context", "true", "false", "nil"]);

    // Add Lua builtins
    const builtins = [
        "assert",
        "collectgarbage",
        "error",
        "getmetatable",
        "ipairs",
        "next",
        "pairs",
        "pcall",
        "print",
        "select",
        "setmetatable",
        "tonumber",
        "tostring",
        "type",
        "unpack",
        "xpcall",
        "string",
        "table",
        "math",
        "_G",
    ];
    builtins.forEach((b) => definedVariables.add(b));

    // First pass: collect all local variable declarations
    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        if (node.type === "LocalStatement") {
            (node.variables || []).forEach((v: LuaNode) => {
                if (v.type === "Identifier") {
                    definedVariables.add(v.name);
                }
            });
        }
        if (node.type === "FunctionDeclaration") {
            // Function parameters
            (node.parameters || []).forEach((p: LuaNode) => {
                if (p.type === "Identifier") {
                    definedVariables.add(p.name);
                }
            });
            // Function name if local
            if (node.identifier && node.identifier.type === "Identifier") {
                definedVariables.add(node.identifier.name);
            }
        }
        if (node.type === "ForNumericStatement" || node.type === "ForGenericStatement") {
            (node.variables || []).forEach((v: LuaNode) => {
                if (v.type === "Identifier") {
                    definedVariables.add(v.name);
                }
            });
        }
    });

    // Collect all identifiers that are property names in member expressions
    // These should NOT be flagged as undefined (e.g., helpers.matches -> matches is a property)
    const memberPropertyPositions = new Set<string>();
    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        if (node.type === "MemberExpression") {
            const identifier = node.identifier;
            if (identifier && identifier.type === "Identifier" && identifier.range) {
                // Mark this position as a member property
                memberPropertyPositions.add(`${identifier.range[0]}-${identifier.range[1]}`);
            }
        }
        // Also skip identifiers that are keys in table constructors
        if (node.type === "TableKeyString" || node.type === "TableKey") {
            const key = node.key;
            if (key && key.type === "Identifier" && key.range) {
                memberPropertyPositions.add(`${key.range[0]}-${key.range[1]}`);
            }
        }
    });

    // Second pass: find usages of undefined variables
    // Note: This is a simplified check - real scope analysis is complex
    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        if (node.type === "Identifier" && node.name && node.range) {
            const name = node.name;
            const posKey = `${node.range[0]}-${node.range[1]}`;

            // Skip if it's a member property (e.g., helpers.matches -> matches)
            if (memberPropertyPositions.has(posKey)) return;

            // Skip if it's defined
            if (definedVariables.has(name)) return;

            // Skip disabled globals (already handled separately)
            if (DISABLED_GLOBALS.includes(name as typeof DISABLED_GLOBALS[number])) return;

            // Skip single-letter variables (often loop vars)
            if (name.length === 1) return;

            // Add warning for potentially undefined variable
            const [from, to] = node.range;
            diagnostics.push({
                from,
                to,
                severity: "warning",
                message: `'${name}' may be undefined`,
                source: "lua-undefined",
            });
        }
    });

    return diagnostics;
}

// =============================================================================
// UNUSED VARIABLE DETECTION
// =============================================================================

interface VariableInfo {
    name: string;
    node: LuaNode;
    used: boolean;
    scopeLevel: number;
}

interface Scope {
    variables: Map<string, VariableInfo>;
    parent?: Scope;
    level: number;
}

function findUnusedVariables(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    let currentScope: Scope = { variables: new Map(), level: 0 };

    // Helper to enter a new scope
    function enterScope() {
        currentScope = {
            variables: new Map(),
            parent: currentScope,
            level: currentScope.level + 1,
        };
    }

    // Helper to exit scope and collect unused variables
    function exitScope() {
        for (const info of currentScope.variables.values()) {
            if (!info.used && !info.name.startsWith("_")) {
                const [from, to] = info.node.range || [0, 0];
                diagnostics.push({
                    from,
                    to,
                    severity: "warning",
                    message: `Unused local variable '${info.name}'`,
                    source: "lua-unused",
                });
            }
        }
        if (currentScope.parent) {
            currentScope = currentScope.parent;
        }
    }

    // Helper to register a declaration
    function declareVariable(name: string, node: LuaNode) {
        if (!currentScope.variables.has(name)) {
            currentScope.variables.set(name, {
                name,
                node,
                used: false,
                scopeLevel: currentScope.level,
            });
        }
    }

    // Helper to mark a variable as used
    function markVariableUsed(name: string) {
        let scope: Scope | undefined = currentScope;
        while (scope) {
            if (scope.variables.has(name)) {
                scope.variables.get(name)!.used = true;
                return;
            }
            scope = scope.parent;
        }
    }

    // Custom walker for scope-aware traversal
    function walk(node: LuaNode) {
        if (!node || typeof node !== "object") return;

        const type = node.type;

        // 1. Scope Creators
        // FunctionDeclaration: creates scope, declares params (in new scope), declares name (in OUTER scope if local)
        if (type === "FunctionDeclaration") {
            // If it's a local function, declare its name in the current (outer) scope
            if (node.isLocal && node.identifier) {
                declareVariable(node.identifier.name, node.identifier);
            }

            // Enter function scope
            enterScope();

            // Declare parameters in the new function scope
            (node.parameters || []).forEach((p: LuaNode) => {
                if (p.type === "Identifier") {
                    declareVariable(p.name, p);
                }
            });

            // Walk body
            (node.body || []).forEach(walk);

            exitScope();
            return;
        }

        // Blocks that create scopes
        const blockTypes = ["DoStatement", "WhileStatement", "RepeatStatement", "IfStatement", "ForStatement", "ForGenericStatement", "ForNumericStatement"];
        if (blockTypes.includes(type)) {
            enterScope();

            // Handle loop variables
            if (type === "ForNumericStatement") {
                if (node.variable && node.variable.type === "Identifier") {
                    declareVariable(node.variable.name, node.variable);
                }
            } else if (type === "ForGenericStatement") {
                (node.variables || []).forEach((v: LuaNode) => {
                    if (v.type === "Identifier") {
                        declareVariable(v.name, v);
                    }
                });
            }

            // Walk children normally
            walkChildren(node);

            exitScope();
            return;
        }

        // 2. Declarations
        if (type === "LocalStatement") {
            // Calculate initializers first (they exist in OUTER scope)
            (node.init || []).forEach(walk);

            // Then declare variables
            (node.variables || []).forEach((v: LuaNode) => {
                if (v.type === "Identifier") {
                    declareVariable(v.name, v);
                }
            });
            return;
        }

        // 3. References
        if (type === "Identifier") {
            markVariableUsed(node.name);
            // Note: We don't stop walking here, but Identifiers usually don't have children to walk.
            // But valid to return.
            return;
        }

        // 4. Special case: MemberExpression (only walk base, not identifier property)
        if (type === "MemberExpression") {
            walk(node.base);
            // Do NOT walk node.identifier (it's a property name, not a variable usage)
            return;
        }

        // 4b. Special case: TableKey/TableKeyString
        if (type === "TableKey" || type === "TableKeyString") {
            if (node.key && node.key.type !== "StringLiteral") {
                // In `a = { key = val }`, "key" is identifier but not usage.
                // luaparse: TableKeyString key is Identifier (but treated as string).
                // TableKey key is expression.
                if (type === "TableKey") walk(node.key);
            }
            walk(node.value);
            return;
        }

        // Default: walk children
        walkChildren(node);
    }

    function walkChildren(node: LuaNode) {
        // Safe mapping for common node keys to avoid missing anything
        for (const key of Object.keys(node)) {
            if (key === "type" || key === "range" || key === "loc" || key === "isLocal") continue;

            // If we already handled specific keys in `walk`, we should skip them here?
            // The `childKeys` approach in `linter.ts` was manual.
            // Let's rely on a robust list or specific logic.

            // Let's stick to the manual list plus a few extras to be safe, 
            // but carefully avoiding "identifier" where it implies definition/property.
        }

        // Re-using the safe list from earlier, but expanded for clauses/etc
        const safeChildKeys = [
            "body", "init", "base", "argument", "arguments",
            "expression", "expressions", "variables", "values",
            "clauses", "condition", "consequent", "alternative",
            "start", "end", "step", "iterators", "fields"
        ];

        for (const key of safeChildKeys) {
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach((c: LuaNode) => walk(c));
            } else if (child && typeof child === "object" && child.type) {
                walk(child);
            }
        }

        // Handle Identifier if it wasn't caught by special cases?
        // No, Identifier type is handled in `walk`. 
        // We just need to make sure we visit properties that ARE expressions.
    }

    // Start walking
    walk(ast as unknown as LuaNode);

    // Process root scope
    exitScope();

    return diagnostics;
}

export interface LuaLinterOptions {
    executionMode?: HookExecutionMode;
    checkReturnType?: boolean;
    checkUndefinedVariables?: boolean;
}

export function createLuaLinter(options: LuaLinterOptions = {}) {
    const { executionMode = "blocking", checkReturnType = true, checkUndefinedVariables = true } = options;

    return function luaLinter(view: EditorView): Diagnostic[] {
        const code = view.state.doc.toString();

        // Skip empty code
        if (!code.trim()) return [];

        const diagnostics: Diagnostic[] = [];

        // Parse the code
        const { ast, syntaxError } = parseLuaCode(code);

        // If syntax error, return just that
        if (syntaxError) {
            return [syntaxError];
        }

        if (!ast) return [];

        // Check for disabled globals
        diagnostics.push(...findDisabledGlobals(ast));

        // Check return statements
        if (checkReturnType) {
            diagnostics.push(...validateReturnStatements(ast, executionMode));
        }

        // Check unused variables
        if (checkUndefinedVariables) {
            diagnostics.push(...findUnusedVariables(ast));
        }

        // Check undefined variables (optional, can be noisy)
        if (checkUndefinedVariables) {
            diagnostics.push(...findUndefinedVariables(ast));
        }

        return diagnostics;
    };
}
