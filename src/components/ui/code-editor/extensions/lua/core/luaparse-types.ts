// =============================================================================
// LUAPARSE TYPE DECLARATIONS
// =============================================================================
// Extended type declarations for luaparse AST nodes
// Based on: https://github.com/fstirlitz/luaparse

import type { Chunk } from "luaparse";

// =============================================================================
// BASE NODE TYPES
// =============================================================================

/**
 * Base interface for all Lua AST nodes
 * Similar to EmmyLua's LuaSyntaxNode
 */
export interface LuaNode {
    type: string;
    range?: [number, number];
    loc?: {
        start: { line: number; column: number };
        end: { line: number; column: number };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

/**
 * Root AST node (Chunk)
 */
export interface LuaChunk extends LuaNode {
    type: "Chunk";
    body: LuaStatement[];
    comments?: LuaComment[];
}

// =============================================================================
// STATEMENT NODES
// =============================================================================

export type LuaStatement =
    | LuaLocalStatement
    | LuaAssignmentStatement
    | LuaCallStatement
    | LuaIfStatement
    | LuaWhileStatement
    | LuaDoStatement
    | LuaRepeatStatement
    | LuaForNumericStatement
    | LuaForGenericStatement
    | LuaReturnStatement
    | LuaBreakStatement
    | LuaLabelStatement
    | LuaGotoStatement
    | LuaFunctionDeclaration;

export interface LuaLocalStatement extends LuaNode {
    type: "LocalStatement";
    variables: LuaIdentifier[];
    init: LuaExpression[];
}

export interface LuaAssignmentStatement extends LuaNode {
    type: "AssignmentStatement";
    variables: LuaExpression[];
    init: LuaExpression[];
}

export interface LuaCallStatement extends LuaNode {
    type: "CallStatement";
    expression: LuaCallExpression;
}

export interface LuaIfStatement extends LuaNode {
    type: "IfStatement";
    clauses: LuaIfClause[];
}

export interface LuaIfClause extends LuaNode {
    type: "IfClause" | "ElseifClause" | "ElseClause";
    condition?: LuaExpression;
    body: LuaStatement[];
}

export interface LuaWhileStatement extends LuaNode {
    type: "WhileStatement";
    condition: LuaExpression;
    body: LuaStatement[];
}

export interface LuaDoStatement extends LuaNode {
    type: "DoStatement";
    body: LuaStatement[];
}

export interface LuaRepeatStatement extends LuaNode {
    type: "RepeatStatement";
    condition: LuaExpression;
    body: LuaStatement[];
}

export interface LuaForNumericStatement extends LuaNode {
    type: "ForNumericStatement";
    variable: LuaIdentifier;
    start: LuaExpression;
    end: LuaExpression;
    step?: LuaExpression;
    body: LuaStatement[];
}

export interface LuaForGenericStatement extends LuaNode {
    type: "ForGenericStatement";
    variables: LuaIdentifier[];
    iterators: LuaExpression[];
    body: LuaStatement[];
}

export interface LuaReturnStatement extends LuaNode {
    type: "ReturnStatement";
    arguments: LuaExpression[];
}

export interface LuaBreakStatement extends LuaNode {
    type: "BreakStatement";
}

export interface LuaLabelStatement extends LuaNode {
    type: "LabelStatement";
    label: LuaIdentifier;
}

export interface LuaGotoStatement extends LuaNode {
    type: "GotoStatement";
    label: LuaIdentifier;
}

export interface LuaFunctionDeclaration extends LuaNode {
    type: "FunctionDeclaration";
    identifier: LuaIdentifier | LuaMemberExpression | null;
    isLocal: boolean;
    parameters: (LuaIdentifier | LuaVarargLiteral)[];
    body: LuaStatement[];
}

// =============================================================================
// EXPRESSION NODES
// =============================================================================

export type LuaExpression =
    | LuaIdentifier
    | LuaStringLiteral
    | LuaNumericLiteral
    | LuaBooleanLiteral
    | LuaNilLiteral
    | LuaVarargLiteral
    | LuaTableConstructorExpression
    | LuaFunctionExpression
    | LuaBinaryExpression
    | LuaUnaryExpression
    | LuaLogicalExpression
    | LuaMemberExpression
    | LuaIndexExpression
    | LuaCallExpression
    | LuaStringCallExpression
    | LuaTableCallExpression;

export interface LuaIdentifier extends LuaNode {
    type: "Identifier";
    name: string;
    isLocal?: boolean;
}

export interface LuaStringLiteral extends LuaNode {
    type: "StringLiteral";
    value: string;
    raw: string;
}

export interface LuaNumericLiteral extends LuaNode {
    type: "NumericLiteral";
    value: number;
    raw: string;
}

export interface LuaBooleanLiteral extends LuaNode {
    type: "BooleanLiteral";
    value: boolean;
    raw: string;
}

export interface LuaNilLiteral extends LuaNode {
    type: "NilLiteral";
    value: null;
    raw: string;
}

export interface LuaVarargLiteral extends LuaNode {
    type: "VarargLiteral";
    value: string;
    raw: string;
}

export interface LuaTableConstructorExpression extends LuaNode {
    type: "TableConstructorExpression";
    fields: LuaTableField[];
}

export type LuaTableField =
    | LuaTableKey
    | LuaTableKeyString
    | LuaTableValue;

export interface LuaTableKey extends LuaNode {
    type: "TableKey";
    key: LuaExpression;
    value: LuaExpression;
}

export interface LuaTableKeyString extends LuaNode {
    type: "TableKeyString";
    key: LuaIdentifier;
    value: LuaExpression;
}

export interface LuaTableValue extends LuaNode {
    type: "TableValue";
    value: LuaExpression;
}

export interface LuaFunctionExpression extends LuaNode {
    type: "FunctionExpression";
    parameters: (LuaIdentifier | LuaVarargLiteral)[];
    body: LuaStatement[];
}

export interface LuaBinaryExpression extends LuaNode {
    type: "BinaryExpression";
    operator: string;
    left: LuaExpression;
    right: LuaExpression;
}

export interface LuaUnaryExpression extends LuaNode {
    type: "UnaryExpression";
    operator: string;
    argument: LuaExpression;
}

export interface LuaLogicalExpression extends LuaNode {
    type: "LogicalExpression";
    operator: "and" | "or";
    left: LuaExpression;
    right: LuaExpression;
}

export interface LuaMemberExpression extends LuaNode {
    type: "MemberExpression";
    indexer: "." | ":";
    identifier: LuaIdentifier;
    base: LuaExpression;
}

export interface LuaIndexExpression extends LuaNode {
    type: "IndexExpression";
    base: LuaExpression;
    index: LuaExpression;
}

export interface LuaCallExpression extends LuaNode {
    type: "CallExpression";
    base: LuaExpression;
    arguments: LuaExpression[];
}

export interface LuaStringCallExpression extends LuaNode {
    type: "StringCallExpression";
    base: LuaExpression;
    argument: LuaStringLiteral;
}

export interface LuaTableCallExpression extends LuaNode {
    type: "TableCallExpression";
    base: LuaExpression;
    arguments: LuaTableConstructorExpression;
}

// =============================================================================
// COMMENT NODES
// =============================================================================

export interface LuaComment extends LuaNode {
    type: "Comment";
    value: string;
    raw: string;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isIdentifier(node: LuaNode): node is LuaIdentifier {
    return node.type === "Identifier";
}

export function isMemberExpression(node: LuaNode): node is LuaMemberExpression {
    return node.type === "MemberExpression";
}

export function isIndexExpression(node: LuaNode): node is LuaIndexExpression {
    return node.type === "IndexExpression";
}

export function isCallExpression(node: LuaNode): node is LuaCallExpression {
    return node.type === "CallExpression";
}

export function isStringCallExpression(node: LuaNode): node is LuaStringCallExpression {
    return node.type === "StringCallExpression";
}

export function isTableCallExpression(node: LuaNode): node is LuaTableCallExpression {
    return node.type === "TableCallExpression";
}

export function isAnyCallExpression(
    node: LuaNode
): node is LuaCallExpression | LuaStringCallExpression | LuaTableCallExpression {
    return (
        node.type === "CallExpression" ||
        node.type === "StringCallExpression" ||
        node.type === "TableCallExpression"
    );
}

export function isFunctionDeclaration(node: LuaNode): node is LuaFunctionDeclaration {
    return node.type === "FunctionDeclaration";
}

export function isFunctionExpression(node: LuaNode): node is LuaFunctionExpression {
    return node.type === "FunctionExpression";
}

export function isAnyFunction(
    node: LuaNode
): node is LuaFunctionDeclaration | LuaFunctionExpression {
    return node.type === "FunctionDeclaration" || node.type === "FunctionExpression";
}

export function isLocalStatement(node: LuaNode): node is LuaLocalStatement {
    return node.type === "LocalStatement";
}

export function isAssignmentStatement(node: LuaNode): node is LuaAssignmentStatement {
    return node.type === "AssignmentStatement";
}

export function isReturnStatement(node: LuaNode): node is LuaReturnStatement {
    return node.type === "ReturnStatement";
}

export function isTableConstructor(node: LuaNode): node is LuaTableConstructorExpression {
    return node.type === "TableConstructorExpression";
}

export function isLiteral(
    node: LuaNode
): node is
    | LuaStringLiteral
    | LuaNumericLiteral
    | LuaBooleanLiteral
    | LuaNilLiteral
    | LuaVarargLiteral {
    return (
        node.type === "StringLiteral" ||
        node.type === "NumericLiteral" ||
        node.type === "BooleanLiteral" ||
        node.type === "NilLiteral" ||
        node.type === "VarargLiteral"
    );
}

export function isBinaryExpression(node: LuaNode): node is LuaBinaryExpression {
    return node.type === "BinaryExpression";
}

export function isUnaryExpression(node: LuaNode): node is LuaUnaryExpression {
    return node.type === "UnaryExpression";
}

export function isLogicalExpression(node: LuaNode): node is LuaLogicalExpression {
    return node.type === "LogicalExpression";
}

export function isStatement(node: LuaNode): node is LuaStatement {
    return (
        node.type === "LocalStatement" ||
        node.type === "AssignmentStatement" ||
        node.type === "CallStatement" ||
        node.type === "IfStatement" ||
        node.type === "WhileStatement" ||
        node.type === "DoStatement" ||
        node.type === "RepeatStatement" ||
        node.type === "ForNumericStatement" ||
        node.type === "ForGenericStatement" ||
        node.type === "ReturnStatement" ||
        node.type === "BreakStatement" ||
        node.type === "LabelStatement" ||
        node.type === "GotoStatement" ||
        node.type === "FunctionDeclaration"
    );
}

export function isExpression(node: LuaNode): node is LuaExpression {
    return (
        node.type === "Identifier" ||
        node.type === "StringLiteral" ||
        node.type === "NumericLiteral" ||
        node.type === "BooleanLiteral" ||
        node.type === "NilLiteral" ||
        node.type === "VarargLiteral" ||
        node.type === "TableConstructorExpression" ||
        node.type === "FunctionExpression" ||
        node.type === "BinaryExpression" ||
        node.type === "UnaryExpression" ||
        node.type === "LogicalExpression" ||
        node.type === "MemberExpression" ||
        node.type === "IndexExpression" ||
        node.type === "CallExpression" ||
        node.type === "StringCallExpression" ||
        node.type === "TableCallExpression"
    );
}

// =============================================================================
// AST UTILITIES
// =============================================================================

/**
 * Get child nodes of an AST node based on its type
 * Similar to EmmyLua's iteration over syntax children
 */
export function getChildren(node: LuaNode): LuaNode[] {
    const children: LuaNode[] = [];

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
        "alternative",
        "start",
        "end",
        "step",
        "iterators",
        "parameters",
        "left",
        "right",
        "key",
        "value",
        "fields",
        "index",
        "label",
    ];

    for (const key of childKeys) {
        const child = node[key];
        if (Array.isArray(child)) {
            for (const c of child) {
                if (c && typeof c === "object" && c.type) {
                    children.push(c as LuaNode);
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            children.push(child as LuaNode);
        }
    }

    return children;
}

/**
 * Walk the AST tree in pre-order
 */
export function walkAST(
    node: LuaNode,
    callback: (node: LuaNode, parent: LuaNode | null) => boolean | void,
    parent: LuaNode | null = null
): void {
    if (!node || typeof node !== "object") return;

    // Callback returns false to stop traversal into children
    const shouldContinue = callback(node, parent);
    if (shouldContinue === false) return;

    const children = getChildren(node);
    for (const child of children) {
        walkAST(child, callback, node);
    }
}

/**
 * Find the innermost node at a given offset position
 */
export function findNodeAtOffset(root: LuaNode, offset: number): LuaNode | null {
    let result: LuaNode | null = null;

    walkAST(root, (node) => {
        if (node.range) {
            const [start, end] = node.range;
            if (offset >= start && offset <= end) {
                result = node;
            }
        }
    });

    return result;
}

/**
 * Find the path from root to the node at a given offset
 */
export function findNodePathAtOffset(root: LuaNode, offset: number): LuaNode[] {
    const path: LuaNode[] = [];

    function visit(node: LuaNode): boolean {
        if (!node || !node.range) return false;

        const [start, end] = node.range;
        if (offset < start || offset > end) return false;

        path.push(node);

        const children = getChildren(node);
        for (const child of children) {
            if (visit(child)) return true;
        }

        return true;
    }

    visit(root);
    return path;
}

/**
 * Get the text range of a node as [start, end]
 */
export function getNodeRange(node: LuaNode): [number, number] | null {
    return node.range ?? null;
}

/**
 * Check if a position is inside a node's range
 */
export function isOffsetInNode(node: LuaNode, offset: number): boolean {
    if (!node.range) return false;
    const [start, end] = node.range;
    return offset >= start && offset <= end;
}

/**
 * Cast luaparse Chunk to our typed LuaChunk
 */
export function asLuaChunk(chunk: Chunk): LuaChunk {
    return chunk as unknown as LuaChunk;
}
