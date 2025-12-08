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
// MAIN LINTER FUNCTION
// =============================================================================

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

        // Check undefined variables (optional, can be noisy)
        if (checkUndefinedVariables) {
            diagnostics.push(...findUndefinedVariables(ast));
        }

        return diagnostics;
    };
}
