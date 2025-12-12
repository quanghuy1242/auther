// =============================================================================
// COMPLETION HANDLER
// =============================================================================
// Provides code completions for the Lua editor
// Inspired by EmmyLua's handlers/completion module structure
// See: emmylua_ls/src/handlers/completion/

import type { Position, CompletionItem, CompletionItemKind } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import { SymbolKind } from "../analysis/symbol-table";
import type { Symbol } from "../analysis/symbol-table";
import type {
    LuaType,
    LuaFunctionType,
    LuaTableType,
    LuaRefType,
} from "../analysis/type-system";
import { LuaTypeKind, LuaTypes, formatType, parseTypeString, functionType } from "../analysis/type-system";
import { getTypeAtFlow, type NarrowingContext } from "../analysis/condition-flow";
import type { LuaFunctionParam } from "../analysis/type-system";
import {
    findNodePathAtOffset,
    isMemberExpression,
    isIdentifier,
    isIndexExpression,
    isLiteral,
    isTableConstructor,
    isCallExpression,
    isLocalStatement,
    isAssignmentStatement,
} from "../core/luaparse-types";
import type {
    LuaNode,
    LuaExpression,
    LuaMemberExpression,
    LuaIndexExpression,
    LuaIdentifier,
    LuaTableConstructorExpression,
    LuaTableKeyString,
    LuaCallExpression,
    LuaLocalStatement,
    LuaAssignmentStatement,
    LuaBinaryExpression,
    LuaFunctionDeclaration,
    LuaFunctionExpression,
} from "../core/luaparse-types";
import { getDefinitionLoader } from "../definitions/definition-loader";
import type { FieldDefinition, FunctionDefinition, TableDefinition, GlobalDefinition } from "../definitions/definition-loader";
// New EmmyLua-style semantic modules
import { isTableLike, isFunctionLike } from "../analysis/type-helpers";
import { findMembers } from "../analysis/member-resolution";

// =============================================================================
// COMPLETION TRIGGER STATUS
// =============================================================================

/**
 * The trigger context for completion
 * Following EmmyLua's CompletionTriggerStatus pattern
 */
export enum CompletionTriggerStatus {
    /** Triggered by '.' for member access */
    Dot = "dot",
    /** Triggered by ':' for method access */
    Colon = "colon",
    /** Triggered by '[' for index access */
    LeftBracket = "left_bracket",
    /** Triggered inside string (for index expressions) */
    InString = "in_string",
    /** Triggered inside table constructor { } */
    InTableConstructor = "in_table_constructor",
    /** Triggered inside function call arguments */
    InCallArguments = "in_call_arguments",
    /** General completion (variable, keyword, etc.) */
    General = "general",
}

// =============================================================================
// COMPLETION BUILDER
// =============================================================================

/**
 * Builder for constructing completion items
 * Following EmmyLua's CompletionBuilder pattern
 */
export class CompletionBuilder {
    private items: CompletionItem[] = [];
    private duplicateNames: Set<string> = new Set();
    private stopped = false;

    constructor(
        readonly document: LuaDocument,
        readonly analysisResult: AnalysisResult,
        readonly position: Position,
        readonly offset: number,
        readonly triggerStatus: CompletionTriggerStatus,
        readonly triggerCharacter?: string,
        readonly options: CompletionOptions = {}
    ) { }

    /**
     * Check if builder has stopped accepting completions
     */
    isStopped(): boolean {
        return this.stopped;
    }

    /**
     * Stop accepting more completions (e.g., after a provider handles the context)
     */
    stopHere(): void {
        this.stopped = true;
    }

    /**
     * Check if a name has already been added
     */
    isDuplicate(name: string): boolean {
        return this.duplicateNames.has(name);
    }

    /**
     * Add a completion item
     */
    addItem(item: CompletionItem): void {
        if (this.stopped) return;
        if (this.duplicateNames.has(item.label)) return;

        this.duplicateNames.add(item.label);
        this.items.push(item);
    }

    /**
     * Add multiple items
     */
    addItems(items: CompletionItem[]): void {
        for (const item of items) {
            this.addItem(item);
        }
    }

    /**
     * Get all completion items with sort text applied
     */
    getCompletionItems(): CompletionItem[] {
        // Apply sort text to items that don't have one
        return this.items.map((item, index) => ({
            ...item,
            sortText: item.sortText ?? String(index + 32).padStart(4, "0"),
        }));
    }

    /**
     * Get trigger text at current position
     */
    getTriggerText(): string {
        // Get the text from line start to cursor
        const line = this.document.getLine(this.position.line);
        return line.slice(0, this.position.character).trimEnd();
    }

    /**
     * Get the word being typed at cursor
     */
    getCurrentWord(): string {
        const line = this.document.getLine(this.position.line);
        const textBeforeCursor = line.slice(0, this.position.character);

        // Find start of current word (identifier characters)
        let wordStart = textBeforeCursor.length;
        while (wordStart > 0 && /[\w_]/.test(textBeforeCursor[wordStart - 1])) {
            wordStart--;
        }

        return textBeforeCursor.slice(wordStart);
    }
}

// =============================================================================
// COMPLETION PROVIDERS
// =============================================================================

/**
 * Provider interface following EmmyLua's provider pattern
 */
interface CompletionProvider {
    addCompletions(builder: CompletionBuilder): void;
}

// -----------------------------------------------------------------------------
// POSTFIX PROVIDER (for .if, .while, .forp, etc.)
// -----------------------------------------------------------------------------

/**
 * Provides postfix completions that transform expressions
 * Following EmmyLua's postfix_provider.rs
 * Example: typing `x.if` becomes `if x then ... end`
 */
class PostfixProvider implements CompletionProvider {
    private readonly postfixSnippets = [
        { label: "if", template: (expr: string) => `if ${expr} then\n\t$0\nend`, detail: "if expr then ... end" },
        { label: "ifn", template: (expr: string) => `if not ${expr} then\n\t$0\nend`, detail: "if not expr then ... end" },
        { label: "while", template: (expr: string) => `while ${expr} do\n\t$0\nend`, detail: "while expr do ... end" },
        { label: "forp", template: (expr: string) => `for \${1:k}, \${2:v} in pairs(${expr}) do\n\t$0\nend`, detail: "for k, v in pairs(expr) do ... end" },
        { label: "forip", template: (expr: string) => `for \${1:i}, \${2:v} in ipairs(${expr}) do\n\t$0\nend`, detail: "for i, v in ipairs(expr) do ... end" },
        { label: "fori", template: (expr: string) => `for \${1:i} = 1, ${expr} do\n\t$0\nend`, detail: "for i = 1, expr do ... end" },
        { label: "insert", template: (expr: string) => `table.insert(${expr}, \${1:value})`, detail: "table.insert(expr, value)" },
        { label: "remove", template: (expr: string) => `table.remove(${expr}, \${1:index})`, detail: "table.remove(expr, index)" },
        { label: "++", template: (expr: string) => `${expr} = ${expr} + 1`, detail: "expr = expr + 1" },
        { label: "--", template: (expr: string) => `${expr} = ${expr} - 1`, detail: "expr = expr - 1" },
        { label: "+n", template: (expr: string) => `${expr} = ${expr} + $1`, detail: "expr = expr + n" },
        { label: "-n", template: (expr: string) => `${expr} = ${expr} - $1`, detail: "expr = expr - n" },
    ];

    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.Dot) return;

        // Get the expression before the dot
        const leftExprInfo = this.getLeftExpressionText(builder);
        if (!leftExprInfo) return;

        const { exprText, replaceStart } = leftExprInfo;

        // Skip if expression resolves to a table type with members (member access takes priority)
        if (this.shouldSkipPostfix(builder, exprText)) return;

        // Add postfix completions
        for (const { label, template, detail } of this.postfixSnippets) {
            const insertText = template(exprText);
            builder.addItem({
                label,
                kind: 15, // Snippet
                detail: `→ ${detail}`,
                insertText,
                insertTextFormat: 2, // Snippet
                // The completion replaces from expression start through the dot
                textEdit: {
                    range: {
                        start: builder.document.offsetToPosition(replaceStart),
                        end: builder.position,
                    },
                    newText: insertText,
                },
            });
        }
    }

    private getLeftExpressionText(builder: CompletionBuilder): { exprText: string; replaceStart: number } | null {
        // Get line text before cursor
        const line = builder.document.getLine(builder.position.line);
        const textBeforeCursor = line.slice(0, builder.position.character);

        // Check if there's a dot right before cursor (the postfix trigger)
        if (!textBeforeCursor.endsWith(".")) return null;

        const lineWithoutDot = textBeforeCursor.slice(0, -1);

        // Match identifier chain (a.b.c or just a)
        const match = lineWithoutDot.match(/([a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*$/);
        if (!match) return null;

        const exprText = match[1];
        const exprStart = lineWithoutDot.length - match[0].trimEnd().length + (match[0].length - match[0].trimStart().length);
        const lineStartOffset = builder.document.positionToOffset({ line: builder.position.line, character: 0 });

        return {
            exprText,
            replaceStart: lineStartOffset + exprStart,
        };
    }

    private shouldSkipPostfix(builder: CompletionBuilder, exprText: string): boolean {
        // If the expression is a known table/object with members, skip postfix
        // to allow member completion to take over
        const definitionLoader = getDefinitionLoader();
        const parts = exprText.split(".");
        const rootName = parts[0];

        // Check if it's a sandbox item with fields (like helpers, context)
        const sandboxItem = definitionLoader.getSandboxItem(rootName);
        if (sandboxItem && (sandboxItem as TableDefinition).fields) {
            return true;
        }

        // Check if it's a library (string, math, table, etc.)
        // Port from EmmyLua: skip postfix for libraries with member completions
        if (definitionLoader.getLibrary(rootName)) {
            return true;
        }

        // Check symbol table for table types
        const symbol = builder.analysisResult.symbolTable.lookupSymbol(rootName, builder.offset);
        if (symbol && symbol.type.kind === LuaTypeKind.TableType) {
            return true;
        }

        return false;
    }
}

// -----------------------------------------------------------------------------
// FUNCTION ARGUMENT PROVIDER (type-aware call argument completions)
// -----------------------------------------------------------------------------

/**
 * Provides type-aware completions for function call arguments
 * Following EmmyLua's function_provider.rs
 * When inside foo(|), infers expected param type and offers appropriate completions
 */
class FunctionArgProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.InCallArguments) return;

        const callContext = this.getCallContext(builder);
        if (!callContext) return;

        const { callExpr, argIndex } = callContext;

        // Infer the function being called
        const funcType = this.inferFunctionType(builder, callExpr);
        if (!funcType || funcType.kind !== LuaTypeKind.FunctionType) return;

        const fnType = funcType as LuaFunctionType;
        const param = fnType.params[argIndex];
        if (!param) return;

        // Dispatch based on expected type
        this.dispatchTypeCompletions(builder, param.type, param.name);
    }

    private getCallContext(builder: CompletionBuilder): { callExpr: LuaCallExpression; argIndex: number } | null {
        const ast = builder.document.getAST();
        if (!ast) return null;

        const nodePath = findNodePathAtOffset(ast, builder.offset);

        // Find CallExpression in the path
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];
            if (isCallExpression(node)) {
                const callExpr = node as LuaCallExpression;
                const argIndex = this.getArgumentIndex(callExpr, builder.offset);
                if (argIndex >= 0) {
                    return { callExpr, argIndex };
                }
            }
        }

        return null;
    }

    private getArgumentIndex(callExpr: LuaCallExpression, offset: number): number {
        const args = callExpr.arguments;
        if (args.length === 0) return 0;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg.range) {
                const [start, end] = arg.range;
                if (offset >= start && offset <= end) {
                    return i;
                }
                // If offset is before this arg, it's after the previous
                if (offset < start) {
                    return i;
                }
            }
        }

        // After all args
        return args.length;
    }

    private inferFunctionType(builder: CompletionBuilder, callExpr: LuaCallExpression): LuaType | null {
        const base = callExpr.base;
        if (!base) return null;

        // Check types map
        if (base.range) {
            const cached = builder.analysisResult.types.get(base.range[0]);
            if (cached) return cached;
        }

        // Try to resolve member expression (e.g., helpers.fetch)
        if (isMemberExpression(base)) {
            const definitionLoader = getDefinitionLoader();
            const memberExpr = base as LuaMemberExpression;

            // Build the chain
            const chain = this.buildMemberChain(memberExpr);
            if (chain.length >= 2) {
                const rootName = chain[0];
                const methodName = chain[chain.length - 1];

                // Check sandbox items
                const sandboxItem = definitionLoader.getSandboxItem(rootName);
                if (sandboxItem && (sandboxItem as TableDefinition).fields) {
                    const fields = (sandboxItem as TableDefinition).fields!;
                    const methodDef = fields[methodName];
                    if (methodDef && methodDef.kind === 'function') {
                        return this.functionDefToType(methodDef as FunctionDefinition);
                    }
                }

                // Check library
                const libDef = definitionLoader.getLibrary(rootName);
                if (libDef?.fields) {
                    const methodDef = libDef.fields[methodName];
                    if (methodDef && methodDef.kind === 'function') {
                        return this.functionDefToType(methodDef as FunctionDefinition);
                    }
                }
            }
        }

        // Try identifier (global function)
        if (isIdentifier(base)) {
            const definitionLoader = getDefinitionLoader();
            const funcName = (base as LuaIdentifier).name;
            const globalDef = definitionLoader.getGlobal(funcName);
            if (globalDef && globalDef.kind === 'function') {
                return this.functionDefToType(globalDef as FunctionDefinition);
            }

            // Check local symbol
            const symbol = builder.analysisResult.symbolTable.lookupSymbol(funcName, builder.offset);
            if (symbol) return symbol.type;
        }

        return null;
    }

    private buildMemberChain(expr: LuaMemberExpression): string[] {
        const parts: string[] = [];
        let current: LuaExpression = expr;

        while (isMemberExpression(current)) {
            const member = current as LuaMemberExpression;
            if (isIdentifier(member.identifier)) {
                parts.unshift(member.identifier.name);
            }
            current = member.base;
        }

        if (isIdentifier(current)) {
            parts.unshift((current as LuaIdentifier).name);
        }

        return parts;
    }

    private functionDefToType(def: FunctionDefinition): LuaType {
        const params: LuaFunctionParam[] = (def.params ?? []).map((p) => ({
            name: p.name,
            type: parseTypeString(p.type),
            optional: p.optional,
            vararg: p.vararg,
        }));
        const returns = def.returns
            ? [parseTypeString(def.returns.type)]
            : [LuaTypes.Void];
        return functionType(params, returns, { isAsync: def.async });
    }

    private dispatchTypeCompletions(builder: CompletionBuilder, type: LuaType, _paramName?: string): void {
        // For function types, offer lambda snippet
        if (type.kind === LuaTypeKind.FunctionType) {
            const fnType = type as LuaFunctionType;
            const paramsStr = fnType.params.map(p => p.name).join(", ");
            const label = `function(${paramsStr}) end`;
            const insertText = `function(${paramsStr})\n\t$0\nend`;

            builder.addItem({
                label,
                kind: 3, // Function
                detail: `→ ${formatType(fnType)}`,
                insertText,
                insertTextFormat: 2, // Snippet
                sortText: "0000", // Prioritize
            });
        }

        // For string Ref types that might be enums, offer string literals
        if (type.kind === LuaTypeKind.Ref) {
            const refType = type as LuaRefType;
            const definitionLoader = getDefinitionLoader();
            const typeFields = definitionLoader.getTypeFields(refType.name);

            // Check if this is an enum-like type (string union)
            if (!typeFields) {
                // Could be a string literal union - try to infer
            }
        }

        // For table types, offer empty table
        if (type.kind === LuaTypeKind.Table || type.kind === LuaTypeKind.TableType) {
            builder.addItem({
                label: "{}",
                kind: 12, // Value
                detail: "Empty table",
                insertText: "{ $0 }",
                insertTextFormat: 2,
            });
        }
    }
}

// -----------------------------------------------------------------------------
// TABLE FIELD PROVIDER (for completions inside table constructors)
// -----------------------------------------------------------------------------

/**
 * Provides completions inside table constructors { }
 * Following EmmyLua's table_field_provider.rs
 * When cursor is in { | } and table has expected type, offers field names
 */
class TableFieldProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.InTableConstructor) return;

        const tableContext = this.getTableContext(builder);
        if (!tableContext) return;

        const { tableExpr, expectedType } = tableContext;
        if (!expectedType) return;

        // Get existing field names to avoid duplicates
        const existingFields = this.getExistingFieldKeys(tableExpr);

        // Add field completions from expected type
        this.addFieldCompletions(builder, expectedType, existingFields);

        builder.stopHere();
    }

    private getTableContext(builder: CompletionBuilder): { tableExpr: LuaTableConstructorExpression; expectedType: LuaType | null } | null {
        const ast = builder.document.getAST();
        if (!ast) return null;

        const nodePath = findNodePathAtOffset(ast, builder.offset);

        // Find TableConstructorExpression in path
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];
            if (isTableConstructor(node)) {
                const tableExpr = node as LuaTableConstructorExpression;
                const expectedType = this.inferExpectedType(builder, nodePath, i);
                return { tableExpr, expectedType };
            }
        }

        return null;
    }

    private inferExpectedType(builder: CompletionBuilder, nodePath: LuaNode[], tableIndex: number): LuaType | null {
        // Look for assignment context: local x = { } or x = { }
        for (let i = tableIndex - 1; i >= 0; i--) {
            const node = nodePath[i];

            if (isLocalStatement(node)) {
                const stmt = node as LuaLocalStatement;
                // Look for type annotation in comments (simplified version)
                // For now, check if there's a cached type from analysis
                if (stmt.variables.length > 0 && stmt.variables[0].range) {
                    const cachedType = builder.analysisResult.types.get(stmt.variables[0].range[0]);
                    if (cachedType) return cachedType;
                }
            }

            if (isAssignmentStatement(node)) {
                const stmt = node as LuaAssignmentStatement;
                if (stmt.variables.length > 0) {
                    const target = stmt.variables[0];
                    if (target.range) {
                        const cachedType = builder.analysisResult.types.get(target.range[0]);
                        if (cachedType) return cachedType;
                    }

                    // Try to look up type from symbol table
                    if (isIdentifier(target)) {
                        const symbol = builder.analysisResult.symbolTable.lookupSymbol(
                            (target as LuaIdentifier).name,
                            builder.offset
                        );
                        if (symbol) return symbol.type;
                    }
                }
            }
        }

        return null;
    }

    private getExistingFieldKeys(tableExpr: LuaTableConstructorExpression): Set<string> {
        const keys = new Set<string>();

        for (const field of tableExpr.fields) {
            if (field.type === "TableKeyString") {
                const keyField = field as LuaTableKeyString;
                if (keyField.key && isIdentifier(keyField.key)) {
                    keys.add(keyField.key.name);
                }
            } else if (field.type === "TableKey") {
                // Handle ["key"] = value form
                if (isLiteral(field.key) && field.key.type === "StringLiteral") {
                    keys.add(field.key.value);
                }
            }
        }

        return keys;
    }

    private addFieldCompletions(builder: CompletionBuilder, type: LuaType, existingFields: Set<string>): void {
        const definitionLoader = getDefinitionLoader();

        // Handle TableType
        if (type.kind === LuaTypeKind.TableType) {
            const tableType = type as LuaTableType;
            tableType.fields.forEach((field) => {
                if (existingFields.has(field.name)) return;

                const isFunction = field.type.kind === LuaTypeKind.FunctionType;
                const { insertText, insertTextFormat } = this.getFieldInsertText(field.name, field.type, isFunction);

                builder.addItem({
                    label: `${field.name} = `,
                    kind: 5, // Field
                    detail: formatType(field.type),
                    insertText,
                    insertTextFormat,
                });
            });
        }

        // Handle Ref types
        if (type.kind === LuaTypeKind.Ref) {
            const refType = type as LuaRefType;
            const typeFields = definitionLoader.getTypeFields(refType.name);
            if (typeFields) {
                for (const [name, fieldDef] of Object.entries(typeFields)) {
                    if (existingFields.has(name)) continue;

                    const fieldType = parseTypeString(fieldDef.type);
                    const isFunction = fieldType.kind === LuaTypeKind.FunctionType;
                    const { insertText, insertTextFormat } = this.getFieldInsertText(name, fieldType, isFunction);

                    builder.addItem({
                        label: `${name} = `,
                        kind: 5, // Field
                        detail: fieldDef.type,
                        insertText,
                        insertTextFormat,
                    });
                }
            }
        }
    }

    private getFieldInsertText(name: string, type: LuaType, isFunction: boolean): { insertText: string; insertTextFormat: 1 | 2 } {
        if (isFunction && type.kind === LuaTypeKind.FunctionType) {
            const fnType = type as LuaFunctionType;
            const paramsStr = fnType.params.map(p => p.name).join(", ");
            return {
                insertText: `${name} = function(${paramsStr})\n\t$0\nend`,
                insertTextFormat: 2, // Snippet
            };
        }

        return {
            insertText: `${name} = $0`,
            insertTextFormat: 2, // Snippet
        };
    }
}

// -----------------------------------------------------------------------------
// EQUALITY PROVIDER (for x == / x ~= type-aware completions)
// -----------------------------------------------------------------------------

/**
 * Provides type-aware completions after == or ~= operators
 * Following EmmyLua's equality_provider.rs
 */
class EqualityProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.General) return;

        const expectedType = this.getExpectedType(builder);
        if (!expectedType) return;

        this.dispatchTypeCompletions(builder, expectedType);
    }

    private getExpectedType(builder: CompletionBuilder): LuaType | null {
        const ast = builder.document.getAST();
        if (!ast) return null;

        const nodePath = findNodePathAtOffset(ast, builder.offset);

        // Look for BinaryExpression with == or ~=
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];
            if (node.type === "BinaryExpression") {
                const binExpr = node as LuaBinaryExpression;
                if (binExpr.operator === "==" || binExpr.operator === "~=") {
                    // Infer type of left side
                    const leftType = this.inferExprType(builder, binExpr.left);
                    if (leftType && leftType.kind !== LuaTypeKind.Unknown) {
                        return leftType;
                    }
                }
            }
        }

        return null;
    }

    private inferExprType(builder: CompletionBuilder, expr: LuaExpression): LuaType | null {
        if (!expr.range) return null;

        const cached = builder.analysisResult.types.get(expr.range[0]);
        if (cached) return cached;

        if (isIdentifier(expr)) {
            const symbol = builder.analysisResult.symbolTable.lookupSymbol(
                (expr as LuaIdentifier).name,
                builder.offset
            );
            if (symbol) return symbol.type;
        }

        return null;
    }

    private dispatchTypeCompletions(builder: CompletionBuilder, type: LuaType): void {
        // For boolean type
        if (type.kind === LuaTypeKind.Boolean) {
            builder.addItem({ label: "true", kind: 14, detail: "boolean" });
            builder.addItem({ label: "false", kind: 14, detail: "boolean" });
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
        }

        // For nil checks
        if (type.kind === LuaTypeKind.Nil) {
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
        }

        // For string type, offer nil
        if (type.kind === LuaTypeKind.String) {
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
            builder.addItem({ label: '""', kind: 21, detail: "empty string", insertText: '""' });
        }

        // For number type
        if (type.kind === LuaTypeKind.Number) {
            builder.addItem({ label: "0", kind: 12, detail: "number" });
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
        }

        // For Ref types that might be enums
        if (type.kind === LuaTypeKind.Ref) {
            const refType = type as LuaRefType;
            const definitionLoader = getDefinitionLoader();
            const typeFields = definitionLoader.getTypeFields(refType.name);
            if (typeFields) {
                for (const [name] of Object.entries(typeFields)) {
                    builder.addItem({
                        label: `${refType.name}.${name}`,
                        kind: 20, // EnumMember
                        detail: refType.name,
                    });
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// DOC TAG PROVIDER (for ---@ tag completions)
// -----------------------------------------------------------------------------

/**
 * EmmyLua doc tag names for annotations
 */
const DOC_TAGS = [
    "param", "return", "type", "class", "field", "alias", "see", "deprecated",
    "overload", "generic", "vararg", "async", "nodiscard", "cast", "operator",
    "enum", "meta", "module", "source", "version", "diagnostic", "as",
    "private", "protected", "public", "package",
];

/**
 * Provides completions for ---@ annotations
 * Following EmmyLua's doc_tag_provider.rs
 */
class DocTagProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if we're in a doc comment context
        if (!this.isInDocComment(builder)) return;

        const sortedTags = [...DOC_TAGS];
        for (let i = 0; i < sortedTags.length; i++) {
            const tag = sortedTags[i];
            builder.addItem({
                label: tag,
                kind: 24, // Event
                detail: `@${tag}`,
                documentation: this.getTagDocumentation(tag),
                sortText: String(i).padStart(3, "0"),
            });
        }

        builder.stopHere();
    }

    private isInDocComment(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // Check for ---@ pattern
        return /---\s*@?\s*[\w]*$/.test(textBefore);
    }

    private getTagDocumentation(tag: string): string {
        const docs: Record<string, string> = {
            param: "Documents a function parameter: `---@param name type description`",
            return: "Documents return value(s): `---@return type description`",
            type: "Specifies the type of a variable: `---@type Type`",
            class: "Defines a class type: `---@class ClassName`",
            field: "Defines a field in a class: `---@field name type`",
            alias: "Creates a type alias: `---@alias Name Type`",
            see: "References related content: `---@see Other`",
            deprecated: "Marks as deprecated: `---@deprecated Use X instead`",
            overload: "Defines function overload: `---@overload fun(a: string): number`",
            generic: "Defines generic type parameter: `---@generic T`",
            vararg: "Documents vararg parameter: `---@vararg type`",
            async: "Marks function as async: `---@async`",
            nodiscard: "Warns if return value ignored: `---@nodiscard`",
            cast: "Casts expression type: `---@cast var Type`",
            operator: "Defines operator metamethod: `---@operator add(number): number`",
            enum: "Defines enum type: `---@enum Name`",
            diagnostic: "Controls diagnostics: `---@diagnostic disable: warning-name`",
            private: "Marks as private: `---@private`",
            protected: "Marks as protected: `---@protected`",
            public: "Marks as public: `---@public`",
            package: "Marks as package-private: `---@package`",
        };
        return docs[tag] ?? `EmmyLua annotation: @${tag}`;
    }
}

// -----------------------------------------------------------------------------
// DOC TYPE PROVIDER (for type completions in annotations)
// -----------------------------------------------------------------------------

/**
 * Provides type name completions inside doc annotations
 * Following EmmyLua's doc_type_provider.rs
 */
class DocTypeProvider implements CompletionProvider {
    private readonly builtinTypes = [
        "nil", "boolean", "number", "string", "table", "function",
        "thread", "userdata", "any", "unknown", "void",
    ];

    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if we're in a type annotation context
        if (!this.isInTypeContext(builder)) return;

        // Add builtin types
        for (const typeName of this.builtinTypes) {
            builder.addItem({
                label: typeName,
                kind: 7, // Class
                detail: "(builtin)",
            });
        }

        // Add custom type definitions from definition loader
        const definitionLoader = getDefinitionLoader();
        const typeNames = definitionLoader.getTypeNames();
        for (const typeName of typeNames) {
            if (!this.builtinTypes.includes(typeName)) {
                builder.addItem({
                    label: typeName,
                    kind: 7, // Class
                    detail: "(defined)",
                });
            }
        }

        builder.stopHere();
    }

    private isInTypeContext(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // After @param name, @return, @type, @field name, @alias name
        return /---@(?:param\s+\w+\s+|return\s+|type\s+|field\s+\w+\s+|alias\s+\w+\s+)[\w.]*$/.test(textBefore);
    }
}

// -----------------------------------------------------------------------------
// DOC NAME TOKEN PROVIDER (for param name completions in annotations)
// -----------------------------------------------------------------------------

/**
 * Provides parameter name completions in ---@param annotations
 * Following EmmyLua's doc_name_token_provider.rs
 */
class DocNameTokenProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if we're after ---@param
        if (!this.isAfterParamTag(builder)) return;

        // Find function parameters from the following function
        const params = this.findFunctionParams(builder);
        for (const param of params) {
            builder.addItem({
                label: param,
                kind: 6, // Variable
                detail: "(parameter)",
            });
        }

        builder.stopHere();
    }

    private isAfterParamTag(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // After ---@param with optional partial name
        return /---@param\s+[\w]*$/.test(textBefore);
    }

    private findFunctionParams(builder: CompletionBuilder): string[] {
        const params: string[] = [];
        const ast = builder.document.getAST();
        if (!ast) return params;

        // Look for function declaration after the current line
        const docOffset = builder.offset;

        // Simple heuristic: look for FunctionDeclaration after current position


        // Search forward in the document for a function
        for (const stmt of ast.body) {
            if (stmt.range && stmt.range[0] > docOffset) {
                if (stmt.type === "FunctionDeclaration") {
                    const funcDecl = stmt as LuaFunctionDeclaration;
                    for (const p of funcDecl.parameters) {
                        if (isIdentifier(p)) {
                            params.push((p as LuaIdentifier).name);
                        }
                    }
                    break;
                }
                if (stmt.type === "LocalStatement") {
                    const localStmt = stmt as LuaLocalStatement;
                    if (localStmt.init.length > 0 && localStmt.init[0].type === "FunctionExpression") {
                        const funcExpr = localStmt.init[0] as LuaFunctionExpression;
                        for (const p of funcExpr.parameters) {
                            if (isIdentifier(p)) {
                                params.push((p as LuaIdentifier).name);
                            }
                        }
                        break;
                    }
                }
            }
        }

        return params;
    }
}

// -----------------------------------------------------------------------------
// DESC PROVIDER (for description references)
// -----------------------------------------------------------------------------

/**
 * Provides completions for description references in comments
 * Following EmmyLua's desc_provider.rs (simplified)
 */
class DescProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if in a see reference or description backtick
        if (!this.isInDescRef(builder)) return;

        // Add global symbols as references
        const definitionLoader = getDefinitionLoader();

        // Add sandbox items
        for (const name of definitionLoader.getSandboxItemNames()) {
            builder.addItem({
                label: name,
                kind: 18, // Reference
                detail: "(global)",
            });
        }

        // Add type names
        for (const name of definitionLoader.getTypeNames()) {
            builder.addItem({
                label: name,
                kind: 7, // Class
                detail: "(type)",
            });
        }

        builder.stopHere();
    }

    private isInDescRef(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // In a backtick reference or @see
        return /`[\w.]*$/.test(textBefore) || /---@see\s+[\w.]*$/.test(textBefore);
    }
}

// -----------------------------------------------------------------------------
// MEMBER PROVIDER (for helpers., context., string., etc.)
// -----------------------------------------------------------------------------

/**
 * Provides completions for member expressions (object.member)
 * Following EmmyLua's member_provider.rs
 */
class MemberProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        
        const ast = builder.document.getAST();
        let node: LuaNode | null = null;
        let nodePath: LuaNode[] = [];

        // Try to get AST node
        if (ast) {
            nodePath = findNodePathAtOffset(ast, builder.offset);
            node = nodePath.length > 0 ? nodePath[nodePath.length - 1] : null;

            // 1. Handle explicit MemberExpression node
            if (node && isMemberExpression(node)) {
                this.completeMemberExpression(builder, node as LuaMemberExpression);
                return;
            }

            // 2. Handle Identifier inside MemberExpression
            if (node && isIdentifier(node) && nodePath.length >= 2) {
                const parent = nodePath[nodePath.length - 2];
                if (isMemberExpression(parent) && (parent as LuaMemberExpression).identifier === node) {
                    this.completeMemberExpression(builder, parent as LuaMemberExpression);
                    return;
                }
            }

            // 3. Handle IndexExpression
            if (node && isIndexExpression(node)) {
                this.completeIndexExpression(builder, node as LuaIndexExpression);
                return;
            }
        }

        // 4. Robust Fallback: Handle trailing dot/colon when AST is missing (syntax error) or incomplete
        // This is critical for typing 'helpers.' or 'a.b.' where the parser often fails to produce a valid tree.
        const charBefore = builder.document.getTextRange(builder.offset - 1, builder.offset);
        if (charBefore === "." || charBefore === ":") {
            // Extract the chain before the dot (e.g. "helpers" or "a.b")
            const lineText = builder.document.getLine(builder.position.line);
            const linePrefix = lineText.substring(0, builder.position.character - 1); // up to dot

            // Regex to capture the chain of identifiers ending at cursor
            // Matches: ident, ident.ident, ident.sub
            const chainMatch = linePrefix.match(/([a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*)$/);

            if (chainMatch) {
                const chain = chainMatch[1];
                const baseType = this.resolveTypeForPath(builder, chain);
                if (baseType.kind !== LuaTypeKind.Unknown) {
                    this.addMemberCompletions(builder, baseType, charBefore === ":");
                    return;
                }
            }
        }
    }

    /**
     * Resolves the type of a string path (e.g. "a.b") using symbol table and globals
     */
    private resolveTypeForPath(builder: CompletionBuilder, path: string): LuaType {
        const parts = path.split(".");
        if (parts.length === 0) return LuaTypes.Unknown;

        // Resolve first part (root)
        const rootName = parts[0];
        let currentType: LuaType;

        // Try local symbol map check
        const symbol = builder.analysisResult.symbolTable.lookupSymbol(rootName, builder.offset);
        if (symbol) {
            // Apply flow-based type narrowing (Phase B.4)
            currentType = this.getNarrowedType(builder, symbol.name, symbol.type);
        } else {
            // Try global
            currentType = this.getGlobalType(rootName, builder);
        }

        // Resolve subsequent parts
        for (let i = 1; i < parts.length; i++) {
            if (currentType.kind === LuaTypeKind.Unknown) return LuaTypes.Unknown;
            currentType = this.findMemberType(currentType, parts[i]);
        }

        return currentType;
    }

    private findMemberType(type: LuaType, memberName: string): LuaType {
        const definitionLoader = getDefinitionLoader();

        if (type.kind === LuaTypeKind.TableType) {
            const tableType = type as LuaTableType;
            const field = tableType.fields.get(memberName);
            if (field) return field.type;
        }

        // Handle Ref types by looking up custom type definitions
        if (type.kind === LuaTypeKind.Ref) {
            const refTypeName = (type as LuaRefType).name;
            const typeFields = definitionLoader.getTypeFields(refTypeName);
            if (typeFields?.[memberName]) {
                return parseTypeString(typeFields[memberName].type);
            }
        }

        return LuaTypes.Unknown;
    }

    private completeMemberExpression(builder: CompletionBuilder, expr: LuaMemberExpression): void {
        const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
        this.addMemberCompletions(builder, baseType, expr.indexer === ":");
    }

    private completeIndexExpression(builder: CompletionBuilder, expr: LuaIndexExpression): void {
        const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
        this.addMemberCompletions(builder, baseType);
    }

    /**
     * Infers the type of the base of a member expression
     */
    private inferBaseType(builder: CompletionBuilder, expr: LuaExpression): LuaType {
        if (!expr) return LuaTypes.Unknown;

        // Check cache first
        if (expr.range) {
            const cached = builder.analysisResult.types.get(expr.range[0]);
            if (cached) return cached;
        }

        if (isIdentifier(expr)) {
            // Check symbol table first for locals
            const symbol = builder.analysisResult.symbolTable.lookupSymbol(expr.name, builder.offset);
            if (symbol) {
                // Apply flow-based type narrowing (Phase B.4)
                return this.getNarrowedType(builder, symbol.name, symbol.type);
            }
            // Fallback to globals
            return this.getGlobalType(expr.name, builder);
        } else if (isMemberExpression(expr)) {
            // Recursively infer type for member expressions (e.g., `a.b.c`)
            const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
            if (baseType.kind !== LuaTypeKind.Unknown && isIdentifier(expr.identifier)) {
                return this.findMemberType(baseType, expr.identifier.name);
            }
        } else if (isIndexExpression(expr)) {
            // Recursively infer type for index expressions (e.g., `a["b"]`)
            const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
            if (baseType.kind !== LuaTypeKind.Unknown && isLiteral(expr.index) && expr.index.type === "StringLiteral") {
                return this.findMemberType(baseType, expr.index.value);
            }
        }

        return LuaTypes.Unknown;
    }

    /**
     * Get the flow-narrowed type for a symbol at the current offset (Phase B.4)
     * Uses condition-flow analysis to narrow types based on control flow
     */
    private getNarrowedType(builder: CompletionBuilder, varName: string, baseType: LuaType): LuaType {
        // If flow tree is empty, return base type
        if (builder.analysisResult.flowTree.isEmpty()) {
            return baseType;
        }

        // Get flow ID at current offset
        const flowId = builder.analysisResult.flowTree.getFlowId(builder.offset);
        if (flowId === undefined) {
            return baseType;
        }

        // Create narrowing context
        const ctx: NarrowingContext = {
            flowTree: builder.analysisResult.flowTree,
            types: builder.analysisResult.types,
            lookupSymbol: (name, off) => builder.analysisResult.symbolTable.lookupSymbol(name, off),
        };

        // Apply flow-based narrowing
        return getTypeAtFlow(ctx, varName, baseType, flowId);
    }

    private inferPrefixType(prefix: string, builder: CompletionBuilder): LuaType {
        // Split the prefix by '.' and resolve
        const parts = prefix.split(".");

        // Resolve first part (local or global)
        const firstName = parts[0];
        let currentType: LuaType;

        const symbol = builder.analysisResult.symbolTable.lookupSymbol(firstName, builder.offset);
        if (symbol && symbol.type !== LuaTypes.Unknown) {
            currentType = symbol.type;
        } else {
            currentType = this.getGlobalType(firstName, builder);
        }

        // Resolve each subsequent part
        for (let i = 1; i < parts.length; i++) {
            currentType = this.resolveMemberType(currentType, parts[i]);
        }

        return currentType;
    }

    private getGlobalType(name: string, builder: CompletionBuilder): LuaType {
        const definitionLoader = getDefinitionLoader();

        // Check sandbox items (data-driven)
        const sandboxItem = definitionLoader.getSandboxItem(name);
        if (sandboxItem) {
            if (definitionLoader.hasHookVariants(name)) {
                // Hook-variant item (like context)
                const fields = definitionLoader.getContextFieldsForHook(builder.options.hookName);
                return this.buildTableTypeFromFields(fields);
            } else if (sandboxItem.fields) {
                // Table with fields
                return this.buildTableTypeFromDefinitions(sandboxItem as TableDefinition);
            } else if (sandboxItem.kind === 'function') {
                return LuaTypes.Function;
            }
        }

        // Check global definitions
        const globalDef = definitionLoader.getGlobal(name);
        if (globalDef) {
            return this.globalDefinitionToType(globalDef);
        }

        // Check library definitions directly (string, math, table, etc.)
        // Port from EmmyLua: libraries are loaded as table types with field members
        const libDef = definitionLoader.getLibrary(name);
        if (libDef) {
            return this.buildTableTypeFromDefinitions(libDef);
        }

        // Check symbol table - note: in MemberProvider context we don't have builder reference
        // This is handled differently

        return LuaTypes.Unknown;
    }

    private resolveMemberType(baseType: LuaType, memberName: string): LuaType {
        const definitionLoader = getDefinitionLoader();

        if (baseType.kind === LuaTypeKind.TableType) {
            const tableType = baseType as LuaTableType;
            const field = tableType.fields.get(memberName);
            if (field) {
                return field.type;
            }
        }

        // Handle Ref types by looking up custom type definitions
        if (baseType.kind === LuaTypeKind.Ref) {
            const refTypeName = (baseType as LuaRefType).name;
            const typeFields = definitionLoader.getTypeFields(refTypeName);
            if (typeFields?.[memberName]) {
                return parseTypeString(typeFields[memberName].type);
            }
        }

        return LuaTypes.Unknown;
    }

    private addMemberCompletions(builder: CompletionBuilder, type: LuaType, _colonCall = false): void {
        const definitionLoader = getDefinitionLoader();

        // =========================================================================
        // NEW: Use findMembers from member-resolution for unified member lookup
        // Port of EmmyLua's get_member_map pattern
        // =========================================================================

        // Check if type is table-like using new type helper
        if (isTableLike(type)) {
            const members = findMembers(type, builder.analysisResult);
            for (const member of members) {
                const isFunction = isFunctionLike(member.type);
                const item = this.createMemberCompletionItem(
                    member.name,
                    member.type,
                    isFunction
                );
                builder.addItem(item);
            }
            return;
        }

        // Handle Ref types by looking up custom type definitions
        if (type.kind === LuaTypeKind.Ref) {
            const refTypeName = (type as LuaRefType).name;
            const typeFields = definitionLoader.getTypeFields(refTypeName);
            if (typeFields) {
                for (const [name, fieldInfo] of Object.entries(typeFields)) {
                    const fieldType = parseTypeString(fieldInfo.type);
                    const isFunction = isFunctionLike(fieldType);
                    const item = this.createMemberCompletionItem(
                        name,
                        fieldType,
                        isFunction
                    );
                    builder.addItem(item);
                }
            }
        }
    }

    private createMemberCompletionItem(
        name: string,
        type: LuaType,
        isFunction: boolean
    ): CompletionItem {
        const kind: CompletionItemKind = isFunction ? 3 : 6; // Function : Property

        let detail = formatType(type);
        let insertText = name;

        if (isFunction && type.kind === LuaTypeKind.FunctionType) {
            const fnType = type as LuaFunctionType;
            // Add parentheses for function completions
            insertText = name;
            detail = this.formatFunctionSignature(name, fnType);
        }

        return {
            label: name,
            kind,
            detail,
            documentation: undefined, // Will be resolved later
            insertText,
            insertTextFormat: 1, // PlainText
        };
    }

    private formatFunctionSignature(name: string, fnType: LuaFunctionType): string {
        const params = fnType.params
            .map((p) => `${p.name}: ${formatType(p.type)}`)
            .join(", ");
        const returns = fnType.returns.map((t) => formatType(t)).join(", ");
        return `function ${name}(${params}): ${returns}`;
    }

    private buildTableTypeFromDefinitions(def: TableDefinition | { kind: string; fields?: Record<string, FieldDefinition> }): LuaType {
        // Defensive check - handle both TableDefinition and LibraryDefinition
        const fieldsObj = def.fields;
        if (!fieldsObj || typeof fieldsObj !== 'object') {
            return LuaTypes.Table;
        }

        const fields = new Map<string, { name: string; type: LuaType; optional?: boolean; description?: string }>();
        for (const [name, fieldDef] of Object.entries(fieldsObj)) {
            if (!fieldDef) continue;
            
            const fieldType = this.definitionToType(fieldDef);
            fields.set(name, {
                name,
                type: fieldType,
                description: fieldDef.description,
            });
        }

        return { kind: LuaTypeKind.TableType, fields } as LuaTableType;
    }

    private buildTableTypeFromFields(fieldsObj: Record<string, FieldDefinition>): LuaType {
        const fields = new Map<string, { name: string; type: LuaType; description?: string }>();
        for (const [name, fieldDef] of Object.entries(fieldsObj)) {
            if (!fieldDef) continue;
            
            const fieldType = this.definitionToType(fieldDef);
            fields.set(name, {
                name,
                type: fieldType,
                description: fieldDef.description,
            });
        }

        return { kind: LuaTypeKind.TableType, fields } as LuaTableType;
    }

    private definitionToType(def: FieldDefinition): LuaType {
        if (!def) return LuaTypes.Unknown;

        switch (def.kind) {
            case "function": {
                const fnDef = def as FunctionDefinition;
                const params: LuaFunctionParam[] = (fnDef.params ?? []).map((p) => ({
                    name: p.name,
                    type: parseTypeString(p.type),
                    optional: p.optional,
                    vararg: p.vararg,
                }));
                const returns = fnDef.returns
                    ? [parseTypeString(fnDef.returns.type)]
                    : [LuaTypes.Void];
                return functionType(params, returns, { isAsync: fnDef.async });
            }

            case "property":
                return parseTypeString(def.type);

            case "table":
                return this.buildTableTypeFromDefinitions(def as TableDefinition);

            default:
                return LuaTypes.Unknown;
        }
    }

    private globalDefinitionToType(def: GlobalDefinition): LuaType {
        if (!def) return LuaTypes.Unknown;

        switch (def.kind) {
            case "function":
                return LuaTypes.Function;
            case "property":
                return LuaTypes.Unknown;
            case "table":
                return LuaTypes.Table;
            default:
                return LuaTypes.Unknown;
        }
    }
}

// -----------------------------------------------------------------------------
// ENVIRONMENT PROVIDER (locals, globals, upvalues)
// -----------------------------------------------------------------------------

/**
 * Provides completions for environment (local variables, globals, upvalues)
 * Following EmmyLua's env_provider.rs
 */
class EnvProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Only for general completion context
        if (builder.triggerStatus !== CompletionTriggerStatus.General) {
            return;
        }

        // Prevent aggressive completion on new lines or empty text
        // (unless triggered manually, but we don't have that info easily, so we rely on word existence)
        const word = builder.getCurrentWord();
        if (!word && !builder.options.isExplicit) {
            return;
        }

        this.addLocalEnv(builder);
        this.addGlobalEnv(builder);
    }

    private addLocalEnv(builder: CompletionBuilder): void {
        // Get visible symbols at offset
        const symbols = builder.analysisResult.symbolTable.getVisibleSymbolsAtOffset(
            builder.offset
        );

        for (const symbol of symbols) {
            // Skip globals (handled separately)
            if (symbol.kind === SymbolKind.Global) continue;

            const item = this.symbolToCompletionItem(symbol);
            builder.addItem(item);
        }
    }

    private addGlobalEnv(builder: CompletionBuilder): void {
        const definitionLoader = getDefinitionLoader();

        // Add sandbox items (data-driven)
        for (const itemName of definitionLoader.getSandboxItemNames()) {
            if (builder.isDuplicate(itemName)) continue;

            const item = definitionLoader.getSandboxItem(itemName);
            if (!item) continue;

            const kind = item.kind === 'function' ? 3 : 6; // Function : Variable
            const detail = (item as FunctionDefinition).signature ?? item.description ?? itemName;

            builder.addItem({
                label: itemName,
                kind,
                detail,
                documentation: item.description,
            });
        }

        // Add builtin globals
        for (const globalName of definitionLoader.getGlobalNames()) {
            if (builder.isDuplicate(globalName)) continue;

            const globalDef = definitionLoader.getGlobal(globalName);
            if (!globalDef) continue;

            builder.addItem({
                label: globalName,
                kind: globalDef.kind === "function" ? 3 : 6,
                detail: (globalDef as FunctionDefinition).signature ?? globalDef.description,
                documentation: globalDef.description,
            });
        }

        // Add builtin libraries
        for (const libName of definitionLoader.getLibraryNames()) {
            if (builder.isDuplicate(libName)) continue;

            builder.addItem({
                label: libName,
                kind: 9, // Module
                detail: `Lua ${libName} library`,
            });
        }
    }

    private symbolToCompletionItem(symbol: Symbol): CompletionItem {
        let kind: CompletionItemKind;

        switch (symbol.kind) {
            case SymbolKind.Local:
                kind = 6; // Variable
                break;
            case SymbolKind.Parameter:
                kind = 6; // Variable
                break;
            case SymbolKind.UpValue:
                kind = 6; // Variable
                break;
            case SymbolKind.Function:
                kind = 3; // Function
                break;
            case SymbolKind.LoopVariable:
                kind = 6; // Variable
                break;
            default:
                kind = 6; // Variable
        }

        const typeStr = formatType(symbol.type);

        // Refine kind based on type (e.g. local function should be Function kind)
        if (symbol.type.kind === LuaTypeKind.Function || symbol.type.kind === LuaTypeKind.FunctionType) {
            kind = 3; // Function
        }

        return {
            label: symbol.name,
            kind,
            detail: `(${symbol.kind}) ${symbol.name}: ${typeStr}`,
            documentation: undefined,
        };
    }
}

// -----------------------------------------------------------------------------
// KEYWORDS PROVIDER
// -----------------------------------------------------------------------------

/**
 * Provides Lua keyword completions
 * Following EmmyLua's keywords_provider.rs
 */
class KeywordsProvider implements CompletionProvider {
    private readonly keywords = [
        "and", "break", "do", "else", "elseif", "end", "false", "for",
        "function", "goto", "if", "in", "local", "nil", "not", "or",
        "repeat", "return", "then", "true", "until", "while",
    ];

    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Only for general completion context
        if (builder.triggerStatus !== CompletionTriggerStatus.General) {
            return;
        }

        // Prevent aggressive completion on new lines or empty text
        const word = builder.getCurrentWord();
        if (!word && !builder.options.isExplicit) {
            return;
        }

        for (const keyword of this.keywords) {
            builder.addItem({
                label: keyword,
                kind: 14, // Keyword
                detail: `(keyword) ${keyword}`,
            });
        }
    }
}

// =============================================================================
// COMPLETION HANDLER
// =============================================================================

/**
 * Options for completion handling
 */
export interface CompletionOptions {
    /** Current hook name for context-aware completions */
    hookName?: string;
    /** Maximum number of items to return */
    maxItems?: number;
    /** Whether completion was explicitly triggered (Ctrl+Space) */
    isExplicit?: boolean;
}

/**
 * Main completion handler following EmmyLua's on_completion pattern
 */
export function getCompletions(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    position: Position,
    triggerCharacter?: string,
    options: CompletionOptions = {}
): CompletionItem[] {
    // Convert position to offset
    const offset = document.positionToOffset(position);

    // Determine trigger status
    const triggerStatus = determineTriggerStatus(document, position, triggerCharacter);

    // Create builder
    const builder = new CompletionBuilder(
        document,
        analysisResult,
        position,
        offset,
        triggerStatus,
        triggerCharacter,
        options // Pass options
    );

    // Run providers in order (following EmmyLua's provider order)
    // Doc providers first, then postfix, equality, function, table_field,
    // env, member, and finally keywords
    const providers: CompletionProvider[] = [
        new DocTagProvider(),
        new DocTypeProvider(),
        new DocNameTokenProvider(),
        new DescProvider(),
        new PostfixProvider(),
        new EqualityProvider(),
        new FunctionArgProvider(),
        new TableFieldProvider(),
        new MemberProvider(),
        new EnvProvider(),
        new KeywordsProvider(),
    ];

    for (const provider of providers) {
        if (builder.isStopped()) break;
        provider.addCompletions(builder);
    }

    // Get and optionally limit items
    let items = builder.getCompletionItems();
    if (options.maxItems && items.length > options.maxItems) {
        items = items.slice(0, options.maxItems);
    }

    return items;
}

/**
 * Determine the completion trigger context
 * Following EmmyLua's pattern of parsing the AST to determine context
 */
function determineTriggerStatus(
    document: LuaDocument,
    position: Position,
    triggerCharacter?: string
): CompletionTriggerStatus {
    // Explicit trigger characters
    if (triggerCharacter === ".") {
        return CompletionTriggerStatus.Dot;
    }
    if (triggerCharacter === ":") {
        return CompletionTriggerStatus.Colon;
    }
    if (triggerCharacter === "[") {
        return CompletionTriggerStatus.LeftBracket;
    }

    // Check line context for non-triggered completion
    const line = document.getLine(position.line);
    const textBefore = line.slice(0, position.character);

    // Check for member access pattern
    if (/\.\s*[\w_]*$/.test(textBefore)) {
        return CompletionTriggerStatus.Dot;
    }
    if (/:\s*[\w_]*$/.test(textBefore)) {
        return CompletionTriggerStatus.Colon;
    }
    if (/\[\s*["']?[\w_]*$/.test(textBefore)) {
        return CompletionTriggerStatus.LeftBracket;
    }

    // Use AST to detect table constructor and call contexts
    const ast = document.getAST();
    if (ast) {
        const offset = document.positionToOffset(position);
        const nodePath = findNodePathAtOffset(ast, offset);

        // Check context from innermost to outermost
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];

            // Check for table constructor context
            if (isTableConstructor(node)) {
                return CompletionTriggerStatus.InTableConstructor;
            }

            // Check for call expression context (inside arguments)
            if (isCallExpression(node)) {
                const callExpr = node as LuaCallExpression;
                // Check if offset is inside the argument list (after the opening paren)
                if (callExpr.base && callExpr.base.range) {
                    const baseEnd = callExpr.base.range[1];
                    if (offset > baseEnd) {
                        return CompletionTriggerStatus.InCallArguments;
                    }
                }
            }
        }
    }

    return CompletionTriggerStatus.General;
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
    CompletionProvider,
};

export {
    MemberProvider,
    EnvProvider,
    KeywordsProvider,
    PostfixProvider,
    FunctionArgProvider,
    TableFieldProvider,
    EqualityProvider,
    DocTagProvider,
    DocTypeProvider,
    DocNameTokenProvider,
    DescProvider,
};
