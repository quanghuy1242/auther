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
        "left",
        "right",
        "value",
        "key",
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
// SYNTAX ERROR DETECTION & PARTIAL PARSING
// =============================================================================

function parseLuaCode(code: string): { ast: LuaAST | null; syntaxError: Diagnostic | null; partialAst: LuaAST | null } {
    const collectedNodes: LuaNode[] = [];

    try {
        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true,
            scope: true,
            comments: false,
            luaVersion: "5.3",
            onCreateNode: (node) => {
                collectedNodes.push(node as unknown as LuaNode);
            }
        }) as LuaAST;

        return { ast, syntaxError: null, partialAst: null };
    } catch (e: unknown) {
        const error = e as { index?: number; line?: number; column?: number; message?: string };

        // Parse error position
        const from = error.index ?? 0;
        const to = from + 1;

        // Clean up error message
        let message = error.message || "Syntax error";
        // Remove the position info that luaparse adds
        message = message.replace(/\s*\[\d+:\d+\]\s*$/, "").trim();

        // Construct partial AST from collected nodes
        let partialAst: LuaAST | null = null;
        if (collectedNodes.length > 0) {
            // Identify roots: iterate reverse, if not visited, it's a root.
            const visited = new Set<LuaNode>();
            const roots: LuaNode[] = [];

            // Helper to mark descendants
            const markVisited = (n: LuaNode) => {
                if (!n || typeof n !== "object") return;
                if (visited.has(n)) return;
                visited.add(n);

                // Walk all properties to be robust
                for (const key in n) {
                    if (key === "loc" || key === "range" || key === "type" || key === "isLocal") continue;
                    const child = n[key];
                    if (Array.isArray(child)) {
                        child.forEach(c => markVisited(c as LuaNode));
                    } else if (child && typeof child === "object" && (child as LuaNode).type) {
                        markVisited(child as LuaNode);
                    }
                }
            };

            // Iterate in reverse to find largest subtrees first
            for (let i = collectedNodes.length - 1; i >= 0; i--) {
                const node = collectedNodes[i];
                if (!visited.has(node)) {
                    roots.push(node);
                    markVisited(node);
                }
            }

            partialAst = {
                type: "Chunk",
                body: roots,
                range: [0, code.length],
            };
        }

        return {
            ast: null,
            partialAst,
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
// UNDEFINED VARIABLE DETECTION (Scope-Aware)
// =============================================================================

function findUndefinedVariables(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Built-in globals
    const globalBuiltins = new Set([
        "assert", "collectgarbage", "error", "getmetatable", "ipairs", "next",
        "pairs", "pcall", "print", "select", "setmetatable", "tonumber",
        "tostring", "type", "unpack", "xpcall", "string", "table", "math",
        "_G", "helpers", "context", "await", "true", "false", "nil", "_VERSION"
    ]);

    // Scope tracking
    interface VarScope {
        variables: Set<string>;
        parent?: VarScope;
    }

    let currentScope: VarScope = { variables: new Set(globalBuiltins) };

    const enterScope = () => {
        currentScope = { variables: new Set(), parent: currentScope };
    };

    const exitScope = () => {
        if (currentScope.parent) {
            currentScope = currentScope.parent;
        }
    };

    const declareVar = (name: string) => {
        currentScope.variables.add(name);
    };

    const isVarDefined = (name: string): boolean => {
        let scope: VarScope | undefined = currentScope;
        while (scope) {
            if (scope.variables.has(name)) return true;
            scope = scope.parent;
        }
        return false;
    };

    // Collect positions to skip (member properties, table keys)
    const skipPositions = new Set<string>();
    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        // Skip member expression properties (e.g., helpers.fetch -> "fetch")
        if (node.type === "MemberExpression" && node.identifier?.range) {
            skipPositions.add(`${node.identifier.range[0]}-${node.identifier.range[1]}`);
        }
        // Skip table key literals (e.g., { allowed = true } -> "allowed")
        if (node.type === "TableKeyString" && node.key?.type === "Identifier" && node.key.range) {
            skipPositions.add(`${node.key.range[0]}-${node.key.range[1]}`);
        }
        // Skip function declaration identifiers (they're definitions handled separately)
        if (node.type === "FunctionDeclaration" && node.identifier?.range) {
            skipPositions.add(`${node.identifier.range[0]}-${node.identifier.range[1]}`);
        }
    });

    // Scope-aware traversal
    const traverse = (node: LuaNode) => {
        if (!node || typeof node !== "object") return;

        // Handle function declarations FIRST (before entering scope)
        if (node.type === "FunctionDeclaration") {
            // Declare function name in CURRENT scope (before entering function body)
            if (node.isLocal && node.identifier?.name) {
                declareVar(node.identifier.name);
            }
            // Now enter function body scope
            enterScope();
            // Parameters declared in function scope
            (node.parameters || []).forEach((p: LuaNode) => {
                if (p.type === "Identifier") declareVar(p.name);
                else if (p.type === "VarargLiteral") declareVar("...");
            });
            // Traverse body
            (node.body || []).forEach(traverse);
            exitScope();
            return;
        }

        const isBlockNode = [
            "FunctionExpression", "DoStatement",
            "WhileStatement", "RepeatStatement", "IfStatement",
            "ForNumericStatement", "ForGenericStatement"
        ].includes(node.type);

        if (isBlockNode) enterScope();

        // Handle declarations
        if (node.type === "LocalStatement") {
            // Process init expressions first (they see outer scope)
            (node.init || []).forEach(traverse);
            // Then declare variables in current scope
            (node.variables || []).forEach((v: LuaNode) => {
                if (v.type === "Identifier") declareVar(v.name);
            });
            // Don't traverse children again
            if (isBlockNode) exitScope();
            return;
        }

        if (node.type === "FunctionExpression") {
            // Parameters in function scope
            (node.parameters || []).forEach((p: LuaNode) => {
                if (p.type === "Identifier") declareVar(p.name);
                else if (p.type === "VarargLiteral") declareVar("...");
            });
            (node.body || []).forEach(traverse);
            exitScope();
            return;
        }

        if (node.type === "ForNumericStatement") {
            // Loop variable
            if (node.variable?.type === "Identifier") {
                declareVar(node.variable.name);
            }
            // Traverse range expressions first
            if (node.start) traverse(node.start);
            if (node.end) traverse(node.end);
            if (node.step) traverse(node.step);
            // Then body
            (node.body || []).forEach(traverse);
            exitScope();
            return;
        }

        if (node.type === "ForGenericStatement") {
            // Declare loop variables
            (node.variables || []).forEach((v: LuaNode) => {
                if (v.type === "Identifier") declareVar(v.name);
            });
            // Traverse iterators and body
            (node.iterators || []).forEach(traverse);
            (node.body || []).forEach(traverse);
            exitScope();
            return;
        }

        // Special handling for table constructor
        if (node.type === "TableConstructorExpression") {
            // Handle each field explicitly to avoid checking table keys as variables
            (node.fields || []).forEach((field: LuaNode) => {
                if (field.type === "TableKeyString") {
                    // For { key = value }, only traverse value, skip key
                    if (field.value) traverse(field.value);
                } else if (field.type === "TableKey") {
                    // For { [expr] = value }, traverse both
                    if (field.key) traverse(field.key);
                    if (field.value) traverse(field.value);
                } else if (field.type === "TableValue") {
                    // For array-like { value }
                    if (field.value) traverse(field.value);
                }
            });
            if (isBlockNode) exitScope();
            return;
        }

        // Check identifier usage
        if (node.type === "Identifier" && node.name && node.range) {
            const posKey = `${node.range[0]}-${node.range[1]}`;
            if (!skipPositions.has(posKey) && !isVarDefined(node.name)) {
                // Skip disabled globals (handled separately)
                if (DISABLED_GLOBALS.includes(node.name as typeof DISABLED_GLOBALS[number])) {
                    // Already handled by findDisabledGlobals
                } else if (node.name.length > 1) { // Skip single-letter vars
                    diagnostics.push({
                        from: node.range[0],
                        to: node.range[1],
                        severity: "error",
                        message: `Variable '${node.name}' is not defined`,
                        source: "lua-undefined",
                    });
                }
            }
        }

        // Traverse children (but not fields, already handled above for TableConstructor)
        const childKeys = [
            "body", "init", "base", "index", "argument", "arguments", "expression",
            "expressions", "values", "clauses", "condition", "consequent",
            "alternative", "iterators", "left", "right", "operand"
        ];

        // Only traverse fields if NOT a TableConstructorExpression (already handled)
        if (node.type !== "TableConstructorExpression" && node.fields) {
            (node.fields as LuaNode[]).forEach(traverse);
        }

        for (const key of childKeys) {
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach(traverse);
            } else if (child && typeof child === "object" && child.type) {
                traverse(child);
            }
        }

        if (isBlockNode) exitScope();
    };

    traverse(ast as unknown as LuaNode);
    return diagnostics;
}

// =============================================================================
// COMMON ERROR DETECTION
// =============================================================================

function checkCommonErrors(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    walkAST(ast as unknown as LuaNode, (node: LuaNode) => {
        // 1. String concatenation with potentially nil values
        if (node.type === "BinaryExpression" && node.operator === "..") {
            // Check if either side could be nil or non-string
            const checkOperand = (operand: LuaNode) => {
                if (operand.type === "NilLiteral") {
                    diagnostics.push({
                        from: operand.range?.[0] ?? 0,
                        to: operand.range?.[1] ?? 0,
                        severity: "error",
                        message: `Cannot concatenate nil value`,
                        source: "lua-type-error",
                    });
                }
            };
            if (node.left) checkOperand(node.left);
            if (node.right) checkOperand(node.right);
        }

        // 2. Division by zero literal
        if (node.type === "BinaryExpression" && (node.operator === "/" || node.operator === "%")) {
            if (node.right?.type === "NumericLiteral" && node.right.value === 0) {
                diagnostics.push({
                    from: node.right.range?.[0] ?? 0,
                    to: node.right.range?.[1] ?? 0,
                    severity: "error",
                    message: `Division by zero`,
                    source: "lua-math-error",
                });
            }
        }

        // 3. Calling non-function values
        if (node.type === "CallExpression") {
            const base = node.base;
            // Check for obvious non-callable types
            if (base.type === "NumericLiteral" || base.type === "StringLiteral" ||
                base.type === "BooleanLiteral" || base.type === "NilLiteral") {
                diagnostics.push({
                    from: base.range?.[0] ?? 0,
                    to: base.range?.[1] ?? 0,
                    severity: "error",
                    message: `Attempting to call a ${base.type.replace("Literal", "").toLowerCase()} value`,
                    source: "lua-type-error",
                });
            }
        }

        // 4. Indexing non-table literals
        if (node.type === "IndexExpression") {
            const base = node.base;
            if (base.type === "NumericLiteral" || base.type === "BooleanLiteral" || base.type === "NilLiteral") {
                diagnostics.push({
                    from: base.range?.[0] ?? 0,
                    to: base.range?.[1] ?? 0,
                    severity: "error",
                    message: `Attempting to index a ${base.type.replace("Literal", "").toLowerCase()} value`,
                    source: "lua-type-error",
                });
            }
        }

        // 5. Comparing incompatible types
        if (node.type === "BinaryExpression" && ["==", "~=", "<", ">", "<=", ">="].includes(node.operator)) {
            const left = node.left;
            const right = node.right;

            // Only flag obvious type mismatches
            const getSimpleType = (n: LuaNode): string | null => {
                if (n.type === "NumericLiteral") return "number";
                if (n.type === "StringLiteral") return "string";
                if (n.type === "BooleanLiteral") return "boolean";
                if (n.type === "NilLiteral") return "nil";
                if (n.type === "TableConstructorExpression") return "table";
                return null;
            };

            const leftType = getSimpleType(left);
            const rightType = getSimpleType(right);

            if (leftType && rightType && leftType !== rightType &&
                leftType !== "nil" && rightType !== "nil" &&
                ["<", ">", "<=", ">="].includes(node.operator)) {
                // Comparison operators require compatible types
                if ((leftType === "number" && rightType === "string") ||
                    (leftType === "string" && rightType === "number") ||
                    leftType === "table" || rightType === "table" ||
                    leftType === "boolean" || rightType === "boolean") {
                    diagnostics.push({
                        from: node.range?.[0] ?? 0,
                        to: node.range?.[1] ?? 0,
                        severity: "warning",
                        message: `Comparing incompatible types: ${leftType} ${node.operator} ${rightType}`,
                        source: "lua-type-warning",
                    });
                }
            }
        }

        // 6. Using # operator on non-table/non-string
        if (node.type === "UnaryExpression" && node.operator === "#") {
            const operand = node.argument;
            if (operand.type === "NumericLiteral" || operand.type === "BooleanLiteral" || operand.type === "NilLiteral") {
                diagnostics.push({
                    from: operand.range?.[0] ?? 0,
                    to: operand.range?.[1] ?? 0,
                    severity: "error",
                    message: `Cannot get length of ${operand.type.replace("Literal", "").toLowerCase()} value`,
                    source: "lua-type-error",
                });
            }
        }

        // 7. Assignment to literal or expression result
        if (node.type === "AssignmentStatement") {
            for (const target of node.variables || []) {
                if (target.type === "NumericLiteral" || target.type === "StringLiteral" ||
                    target.type === "BooleanLiteral" || target.type === "NilLiteral") {
                    diagnostics.push({
                        from: target.range?.[0] ?? 0,
                        to: target.range?.[1] ?? 0,
                        severity: "error",
                        message: `Cannot assign to literal value`,
                        source: "lua-syntax-error",
                    });
                }
                // Check for function call result assignment
                if (target.type === "CallExpression") {
                    diagnostics.push({
                        from: target.range?.[0] ?? 0,
                        to: target.range?.[1] ?? 0,
                        severity: "error",
                        message: `Cannot assign to function call result`,
                        source: "lua-syntax-error",
                    });
                }
            }
        }

        // 10. Using 'local' in wrong context
        if (node.type === "LocalStatement" && node.variables) {
            for (const v of node.variables) {
                if (v.type === "Identifier" && v.name === "_G") {
                    diagnostics.push({
                        from: v.range?.[0] ?? 0,
                        to: v.range?.[1] ?? 0,
                        severity: "warning",
                        message: `Shadowing global '_G' with local variable`,
                        source: "lua-shadowing",
                    });
                }
            }
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

        if (type === "FunctionExpression") {
            // Enter function scope
            enterScope();

            // Declare parameters
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
            "start", "end", "step", "iterators", "fields",
            "left", "right", "value", "key"
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

// =============================================================================
// COMPLEXITY CHECKS
// =============================================================================

function checkComplexity(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Recursive function to check loop depth
    function checkNode(node: LuaNode, depth: number) {
        if (!node || typeof node !== "object") return;

        let nextDepth = depth;
        const loopTypes = ["WhileStatement", "RepeatStatement", "ForStatement", "ForGenericStatement", "ForNumericStatement"];

        if (loopTypes.includes(node.type)) {
            nextDepth++;
            if (nextDepth >= 3) {
                const [from, to] = node.range || [0, 0];
                // Avoid duplicate warnings for same nest
                // We warn at the start of the 3rd level loop
                diagnostics.push({
                    from,
                    to,
                    severity: "warning",
                    message: "Deeply nested loops (depth >= 3) may exceed instruction limits (50k ops).",
                    source: "lua-complexity",
                });
            }
        }

        // Walk children
        const childKeys = [
            "body", "init", "base", "argument", "arguments",
            "expression", "expressions", "variables", "values",
            "clauses", "condition", "consequent", "alternative",
            "start", "end", "step", "iterators", "fields",
            "left", "right", "value", "key"
        ];

        for (const key of childKeys) {
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach((c: LuaNode) => checkNode(c, nextDepth));
            } else if (child && typeof child === "object" && child.type) {
                checkNode(child, nextDepth);
            }
        }
    }

    checkNode(ast as unknown as LuaNode, 0);
    return diagnostics;
}

// =============================================================================
// ADVANCED CHECKS (ReadOnly, Shadowing)
// =============================================================================

function checkAdvancedRules(ast: LuaAST): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Scope management for shadowing
    const scopeStack: Set<string>[] = [new Set()]; // Global scope
    const enterScope = () => scopeStack.push(new Set());
    const exitScope = () => scopeStack.pop();
    const defineVar = (name: string, node: LuaNode) => {
        const current = scopeStack[scopeStack.length - 1];
        if (scopeStack.length > 1) {
            // Check for shadowing of OUTER scopes
            for (let i = 0; i < scopeStack.length - 1; i++) {
                if (scopeStack[i].has(name)) {
                    diagnostics.push({
                        from: node.range ? node.range[0] : 0,
                        to: node.range ? node.range[1] : 0,
                        severity: "warning",
                        message: `Variable '${name}' shadows an existing variable in an outer scope.`,
                    });
                }
            }
        }
        current.add(name);
    };

    const traverse = (node: LuaNode) => {
        if (!node) return;

        // --- SCOPE MANAGEMENT ---
        const isBlock = ["FunctionDeclaration", "FunctionExpression", "DoStatement", "WhileStatement", "RepeatStatement", "IfStatement", "ForNumericStatement", "ForGenericStatement"].includes(node.type);
        if (isBlock) enterScope();

        // --- READ-ONLY CHECKS ---
        if (node.type === "AssignmentStatement") {
            const vars = node.variables || [];
            vars.forEach((v: LuaNode) => {
                if (v.type === "Identifier") {
                    // 1. Root assignment to context or helpers
                    if (v.name === "context" || v.name === "helpers") {
                        diagnostics.push({
                            from: v.range ? v.range[0] : 0,
                            to: v.range ? v.range[1] : 0,
                            severity: "error",
                            message: `Cannot reassign read-only global '${v.name}'.`
                        });
                    } else if (scopeStack.length > 1) {
                        // 3. Accidental Global Creation check
                        // If assigning to a variable NOT in scope (and not defined in any outer scope),
                        // and we are NOT at root scope -> Warning
                        let found = false;
                        for (let i = scopeStack.length - 1; i >= 0; i--) {
                            if (scopeStack[i].has(v.name)) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            diagnostics.push({
                                from: v.range ? v.range[0] : 0,
                                to: v.range ? v.range[1] : 0,
                                severity: "warning",
                                message: `Global variable creation '${v.name}' inside function. Did you mean 'local ${v.name}'?`
                            });
                        }
                    }
                } else if (v.type === "MemberExpression") {
                    // 2. Member assignment check
                    const base = v.base;
                    if (base.type === "Identifier") {
                        if (base.name === "helpers") {
                            diagnostics.push({
                                from: v.range ? v.range[0] : 0,
                                to: v.range ? v.range[1] : 0,
                                severity: "error",
                                message: `Cannot modify 'helpers' library.`
                            });
                        }
                    }
                }
            });
        }

        // --- SHADOWING CHECKS + DEFINITIONS ---
        if (node.type === "LocalStatement") {
            const vars = node.variables || [];
            vars.forEach((v: LuaNode) => {
                if (v.type === "Identifier") {
                    defineVar(v.name, v);
                }
            });
        }
        if (node.type === "FunctionDeclaration") {
            if (node.identifier && node.identifier.type === "Identifier") {
                if (node.isLocal) {
                    defineVar(node.identifier.name, node.identifier);
                }
            }
            // Parameters are in the NEW scope
            const current = scopeStack[scopeStack.length - 1];
            const params = node.parameters || [];
            params.forEach((p: LuaNode) => {
                if (p.type === "Identifier") {
                    for (let i = 0; i < scopeStack.length - 1; i++) {
                        if (scopeStack[i].has(p.name)) {
                            diagnostics.push({
                                from: p.range ? p.range[0] : 0,
                                to: p.range ? p.range[1] : 0,
                                severity: "warning",
                                message: `Parameter '${p.name}' shadows an existing variable.`,
                            });
                        }
                    }
                    current.add(p.name);
                }
            });
        }
        if (node.type === "FunctionExpression") {
            // Parameters are in the NEW scope
            const current = scopeStack[scopeStack.length - 1]; // We already entered scope due to isBlock check
            const params = node.parameters || [];
            params.forEach((p: LuaNode) => {
                if (p.type === "Identifier") {
                    for (let i = 0; i < scopeStack.length - 1; i++) {
                        if (scopeStack[i].has(p.name)) {
                            // Shadowing warning for anonymous function params too? Sure.
                            // diagnostics.push(...) 
                            // Keep it simpler for now or replicate warning
                        }
                    }
                    current.add(p.name);
                }
            });
        }

        // Loop variables
        if (node.type === "ForNumericStatement") {
            if (node.variable && node.variable.type === "Identifier") {
                const current = scopeStack[scopeStack.length - 1];
                for (let i = 0; i < scopeStack.length - 1; i++) {
                    if (scopeStack[i].has(node.variable.name)) {
                        diagnostics.push({
                            from: node.variable.range ? node.variable.range[0] : 0,
                            to: node.variable.range ? node.variable.range[1] : 0,
                            severity: "warning",
                            message: `Loop variable '${node.variable.name}' shadows an existing variable.`,
                        });
                    }
                }
                current.add(node.variable.name);
            }
        }
        if (node.type === "ForGenericStatement") {
            const vars = node.variables || [];
            vars.forEach((v: LuaNode) => {
                if (v.type === "Identifier") {
                    const current = scopeStack[scopeStack.length - 1];
                    for (let i = 0; i < scopeStack.length - 1; i++) {
                        if (scopeStack[i].has(v.name)) {
                            diagnostics.push({
                                from: v.range ? v.range[0] : 0,
                                to: v.range ? v.range[1] : 0,
                                severity: "warning",
                                message: `Loop variable '${v.name}' shadows an existing variable.`,
                            });
                        }
                    }
                    current.add(v.name);
                }
            });
        }

        // --- RECURSION ---
        const childKeys = [
            "body", "init", "base", "identifier", "argument", "arguments",
            "expression", "expressions", "variables", "values", "clauses",
            "condition", "consequent", "start", "end", "step", "iterators",
            "left", "right", "value", "key", "block"
        ];

        for (const key of childKeys) {
            const child = node[key];
            if (key === "parameters") continue;
            if (key === "variables" && (node.type === "LocalStatement" || node.type === "AssignmentStatement" || node.type === "ForGenericStatement")) continue;
            if (key === "variable" && node.type === "ForNumericStatement") continue;

            if (Array.isArray(child)) {
                child.forEach(traverse);
            } else if (child && typeof child === "object" && child.type) {
                traverse(child);
            }
        }

        if (isBlock) exitScope();
    };

    traverse(ast as unknown as LuaNode);

    return diagnostics;
}

export interface LuaLinterOptions {
    executionMode?: HookExecutionMode;
    checkReturnType?: boolean;
    checkUndefinedVariables?: boolean;
}

export function createLuaLinter(options: LuaLinterOptions = {}) {
    const { executionMode = "blocking", checkReturnType = true, checkUndefinedVariables = true } = options;
    const MAX_SCRIPT_SIZE = 5120; // 5KB

    return function luaLinter(view: EditorView): Diagnostic[] {
        const code = view.state.doc.toString();

        // 1. Script Size Check
        if (code.length > MAX_SCRIPT_SIZE) {
            return [{
                from: 0,
                to: Math.min(code.length, 100),
                severity: "error",
                message: `Script size (${code.length} bytes) exceeds limit of ${MAX_SCRIPT_SIZE} bytes.`,
                source: "lua-limit",
            }];
        }

        // Skip empty code
        if (!code.trim()) return [];

        const diagnostics: Diagnostic[] = [];

        // Parse the code
        // Parse the code
        const { ast, syntaxError, partialAst } = parseLuaCode(code);

        // Always include syntax error if present
        if (syntaxError) {
            diagnostics.push(syntaxError);
        }

        // Use valid AST or partial AST fallback
        const targetAst = ast || partialAst;

        if (!targetAst) return diagnostics;

        // Check for disabled globals
        diagnostics.push(...findDisabledGlobals(targetAst));

        // Check advanced rules (ReadOnly, Shadowing)
        diagnostics.push(...checkAdvancedRules(targetAst));

        // Check complexity (Nested Loops)
        diagnostics.push(...checkComplexity(targetAst));

        // Check return statements (only if full AST, to avoid noise during typing?)
        // Actually, partial AST might be "valid" enough. Let's run it but maybe suppress if syntax error?
        // If syntax error exists, "missing return" might just be because they haven't typed it yet.
        // So we skip return type check if syntax error exists.
        if (checkReturnType && !syntaxError) {
            diagnostics.push(...validateReturnStatements(targetAst, executionMode));
        }

        // Check undefined variables (errors for truly undefined)
        if (checkUndefinedVariables) {
            diagnostics.push(...findUndefinedVariables(targetAst));
        }

        // Check unused variables (warnings for declared but unused)
        if (checkUndefinedVariables) {
            diagnostics.push(...findUnusedVariables(targetAst));
        }

        // Check for common errors (type mismatches, nil access, etc.)
        diagnostics.push(...checkCommonErrors(targetAst));

        return diagnostics;
    };
}
