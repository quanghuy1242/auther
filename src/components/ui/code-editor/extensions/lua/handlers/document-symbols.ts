// =============================================================================
// DOCUMENT SYMBOLS HANDLER
// =============================================================================
// Provides document symbols (outline) for the Lua editor
// Inspired by EmmyLua's handlers/document_symbol module structure
// See: emmylua_ls/src/handlers/document_symbol/

import type { Range, DocumentSymbol } from "../protocol";
import { SymbolKind, createRange } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import {
    isIdentifier,
    isMemberExpression,
    isFunctionDeclaration,
    isFunctionExpression,
    isLocalStatement,
    isAssignmentStatement,
} from "../core/luaparse-types";
import type {
    LuaNode,
    LuaStatement,
    LuaIdentifier,
    LuaMemberExpression,
    LuaFunctionDeclaration,
    LuaFunctionExpression,
    LuaLocalStatement,
    LuaAssignmentStatement,
    LuaTableConstructorExpression,
} from "../core/luaparse-types";

// =============================================================================
// DOCUMENT SYMBOL BUILDER
// =============================================================================

/**
 * Builder for constructing document symbols
 * Following EmmyLua's DocumentSymbolBuilder pattern
 */
class DocumentSymbolBuilder {
    private symbols: DocumentSymbol[] = [];
    private symbolStack: DocumentSymbol[][] = [];

    constructor(
        private document: LuaDocument,
        private analysisResult: AnalysisResult
    ) {
        this.symbolStack.push(this.symbols);
    }

    /**
     * Add a symbol at the current level
     */
    addSymbol(symbol: DocumentSymbol): void {
        const currentLevel = this.symbolStack[this.symbolStack.length - 1];
        currentLevel.push(symbol);
    }

    /**
     * Start a new nested level for children
     */
    pushLevel(symbol: DocumentSymbol): void {
        if (!symbol.children) {
            symbol.children = [];
        }
        this.symbolStack.push(symbol.children);
    }

    /**
     * Pop back to the parent level
     */
    popLevel(): void {
        if (this.symbolStack.length > 1) {
            this.symbolStack.pop();
        }
    }

    /**
     * Get the built symbols
     */
    getSymbols(): DocumentSymbol[] {
        return this.symbols;
    }

    /**
     * Create a range from a node
     */
    nodeToRange(node: LuaNode): Range {
        if (node.range) {
            return this.document.offsetRangeToRange(node.range[0], node.range[1]);
        }
        if (node.loc) {
            return this.document.locToRange(node.loc);
        }
        return createRange({ line: 0, character: 0 }, { line: 0, character: 0 });
    }

    /**
     * Create a selection range (usually the name)
     */
    selectionRange(node: LuaNode, nameNode?: LuaNode): Range {
        const n = nameNode ?? node;
        return this.nodeToRange(n);
    }
}

// =============================================================================
// SYMBOL PROCESSING
// =============================================================================

/**
 * Process a function declaration and add it as a document symbol
 */
function processFunctionDeclaration(
    builder: DocumentSymbolBuilder,
    funcDecl: LuaFunctionDeclaration
): void {
    const name = getFunctionName(funcDecl);
    const kind = funcDecl.isLocal ? SymbolKind.Function : SymbolKind.Method;
    const range = builder.nodeToRange(funcDecl);
    const selectionRange = funcDecl.identifier
        ? builder.nodeToRange(funcDecl.identifier as LuaNode)
        : range;

    const symbol: DocumentSymbol = {
        name,
        kind,
        range,
        selectionRange,
        detail: formatFunctionParams(funcDecl),
        children: [],
    };

    builder.addSymbol(symbol);
    builder.pushLevel(symbol);

    // Process function body for nested symbols
    if (funcDecl.body) {
        for (const stmt of funcDecl.body) {
            processStatement(builder, stmt);
        }
    }

    builder.popLevel();
}

/**
 * Get the name of a function declaration
 */
function getFunctionName(funcDecl: LuaFunctionDeclaration): string {
    if (!funcDecl.identifier) {
        return "(anonymous)";
    }

    if (isIdentifier(funcDecl.identifier)) {
        return (funcDecl.identifier as LuaIdentifier).name;
    }

    if (isMemberExpression(funcDecl.identifier)) {
        const memberExpr = funcDecl.identifier as LuaMemberExpression;
        const base = isIdentifier(memberExpr.base)
            ? (memberExpr.base as LuaIdentifier).name
            : "...";
        return `${base}${memberExpr.indexer}${memberExpr.identifier.name}`;
    }

    return "(function)";
}

/**
 * Format function parameters for display
 */
function formatFunctionParams(funcDecl: LuaFunctionDeclaration): string {
    const params = funcDecl.parameters.map((p) => {
        if (isIdentifier(p)) {
            return (p as LuaIdentifier).name;
        }
        if (p.type === "VarargLiteral") {
            return "...";
        }
        return "?";
    });
    return `(${params.join(", ")})`;
}

/**
 * Process a local statement
 */
function processLocalStatement(
    builder: DocumentSymbolBuilder,
    localStmt: LuaLocalStatement
): void {
    for (let i = 0; i < localStmt.variables.length; i++) {
        const variable = localStmt.variables[i];
        const init = localStmt.init[i];

        // Check if init is a function expression
        if (init && isFunctionExpression(init)) {
            const funcExpr = init as LuaFunctionExpression;
            const name = variable.name;
            const range = builder.nodeToRange(localStmt);
            const selectionRange = builder.nodeToRange(variable);

            const symbol: DocumentSymbol = {
                name,
                kind: SymbolKind.Function,
                range,
                selectionRange,
                detail: formatFunctionExprParams(funcExpr),
                children: [],
            };

            builder.addSymbol(symbol);
            builder.pushLevel(symbol);

            if (funcExpr.body) {
                for (const stmt of funcExpr.body) {
                    processStatement(builder, stmt);
                }
            }

            builder.popLevel();
        } else if (init && init.type === "TableConstructorExpression") {
            // Table definition
            const name = variable.name;
            const range = builder.nodeToRange(localStmt);
            const selectionRange = builder.nodeToRange(variable);

            const symbol: DocumentSymbol = {
                name,
                kind: SymbolKind.Variable,
                range,
                selectionRange,
                children: [],
            };

            builder.addSymbol(symbol);

            // Process table fields for nested symbols
            const tableExpr = init as LuaTableConstructorExpression;
            processTableFields(builder, symbol, tableExpr);
        } else {
            // Simple variable
            const symbol: DocumentSymbol = {
                name: variable.name,
                kind: SymbolKind.Variable,
                range: builder.nodeToRange(localStmt),
                selectionRange: builder.nodeToRange(variable),
            };

            builder.addSymbol(symbol);
        }
    }
}

/**
 * Format function expression parameters
 */
function formatFunctionExprParams(funcExpr: LuaFunctionExpression): string {
    const params = funcExpr.parameters.map((p) => {
        if (isIdentifier(p)) {
            return (p as LuaIdentifier).name;
        }
        if (p.type === "VarargLiteral") {
            return "...";
        }
        return "?";
    });
    return `(${params.join(", ")})`;
}

/**
 * Process table fields for document symbols
 */
function processTableFields(
    builder: DocumentSymbolBuilder,
    parentSymbol: DocumentSymbol,
    tableExpr: LuaTableConstructorExpression
): void {
    if (!parentSymbol.children) {
        parentSymbol.children = [];
    }

    for (const field of tableExpr.fields) {
        if (field.type === "TableKeyString" || field.type === "TableKey") {
            const keyField = field as unknown as {
                key: LuaNode;
                value: LuaNode;
            };

            let fieldName = "(key)";
            if (isIdentifier(keyField.key)) {
                fieldName = (keyField.key as LuaIdentifier).name;
            } else if (keyField.key.type === "StringLiteral") {
                fieldName = (keyField.key as unknown as { value: string }).value;
            }

            let fieldKind = SymbolKind.Field;
            if (keyField.value && isFunctionExpression(keyField.value)) {
                fieldKind = SymbolKind.Method;
            }

            const symbol: DocumentSymbol = {
                name: fieldName,
                kind: fieldKind,
                range: builder.nodeToRange(field),
                selectionRange: builder.nodeToRange(keyField.key),
            };

            parentSymbol.children.push(symbol);
        }
    }
}

/**
 * Process an assignment statement
 */
function processAssignmentStatement(
    builder: DocumentSymbolBuilder,
    assignStmt: LuaAssignmentStatement
): void {
    for (let i = 0; i < assignStmt.variables.length; i++) {
        const variable = assignStmt.variables[i];
        const init = assignStmt.init[i];

        // Only include meaningful assignments (functions, tables)
        if (init && isFunctionExpression(init)) {
            const funcExpr = init as LuaFunctionExpression;

            let name = "(expression)";
            if (isIdentifier(variable)) {
                name = (variable as LuaIdentifier).name;
            } else if (isMemberExpression(variable)) {
                const memberExpr = variable as LuaMemberExpression;
                const base = isIdentifier(memberExpr.base)
                    ? (memberExpr.base as LuaIdentifier).name
                    : "...";
                name = `${base}${memberExpr.indexer}${memberExpr.identifier.name}`;
            }

            const symbol: DocumentSymbol = {
                name,
                kind: SymbolKind.Function,
                range: builder.nodeToRange(assignStmt),
                selectionRange: builder.nodeToRange(variable),
                detail: formatFunctionExprParams(funcExpr),
                children: [],
            };

            builder.addSymbol(symbol);
            builder.pushLevel(symbol);

            if (funcExpr.body) {
                for (const stmt of funcExpr.body) {
                    processStatement(builder, stmt);
                }
            }

            builder.popLevel();
        }
    }
}

/**
 * Process a statement recursively
 */
function processStatement(builder: DocumentSymbolBuilder, stmt: LuaStatement): void {
    if (isFunctionDeclaration(stmt)) {
        processFunctionDeclaration(builder, stmt as LuaFunctionDeclaration);
    } else if (isLocalStatement(stmt)) {
        processLocalStatement(builder, stmt as LuaLocalStatement);
    } else if (isAssignmentStatement(stmt)) {
        processAssignmentStatement(builder, stmt as LuaAssignmentStatement);
    } else if (stmt.type === "DoStatement") {
        const doStmt = stmt as unknown as { body: LuaStatement[] };
        if (doStmt.body) {
            for (const s of doStmt.body) {
                processStatement(builder, s);
            }
        }
    } else if (stmt.type === "IfStatement") {
        const ifStmt = stmt as unknown as { clauses: Array<{ body: LuaStatement[] }> };
        if (ifStmt.clauses) {
            for (const clause of ifStmt.clauses) {
                if (clause.body) {
                    for (const s of clause.body) {
                        processStatement(builder, s);
                    }
                }
            }
        }
    } else if (stmt.type === "WhileStatement" || stmt.type === "ForNumericStatement" ||
        stmt.type === "ForGenericStatement" || stmt.type === "RepeatStatement") {
        const loopStmt = stmt as unknown as { body: LuaStatement[] };
        if (loopStmt.body) {
            for (const s of loopStmt.body) {
                processStatement(builder, s);
            }
        }
    }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Options for document symbols
 */
export interface DocumentSymbolOptions {
    /** Whether to include local variables */
    includeVariables?: boolean;
    /** Maximum depth for nested symbols */
    maxDepth?: number;
}

/**
 * Main document symbols handler following EmmyLua's build_document_symbol function
 */
export function getDocumentSymbols(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    _options: DocumentSymbolOptions = {}
): DocumentSymbol[] {
    const ast = document.getAST();
    if (!ast) return [];

    const builder = new DocumentSymbolBuilder(document, analysisResult);

    // Process all top-level statements
    for (const stmt of ast.body) {
        processStatement(builder, stmt);
    }

    return builder.getSymbols();
}

/**
 * Get a flat list of all symbols (for workspace symbol search)
 */
export function getFlatSymbols(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    options: DocumentSymbolOptions = {}
): Array<{ name: string; kind: SymbolKind; range: Range }> {
    const hierarchical = getDocumentSymbols(document, analysisResult, options);
    const flat: Array<{ name: string; kind: SymbolKind; range: Range }> = [];

    const flatten = (symbols: DocumentSymbol[], prefix = "") => {
        for (const sym of symbols) {
            flat.push({
                name: prefix ? `${prefix}.${sym.name}` : sym.name,
                kind: sym.kind,
                range: sym.range,
            });
            if (sym.children) {
                flatten(sym.children, sym.name);
            }
        }
    };

    flatten(hierarchical);
    return flat;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DocumentSymbolBuilder, processStatement };
