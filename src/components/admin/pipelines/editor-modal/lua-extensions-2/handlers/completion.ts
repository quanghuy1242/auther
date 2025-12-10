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
} from "../analysis/type-system";
import { LuaTypeKind, LuaTypes, formatType, parseTypeString, functionType } from "../analysis/type-system";
import type { LuaFunctionParam } from "../analysis/type-system";
import {
    findNodeAtOffset,
    findNodePathAtOffset,
    isMemberExpression,
    isIdentifier,
    isIndexExpression,
    isExpression,
    isLiteral,
} from "../core/luaparse-types";
import type {
    LuaNode,
    LuaExpression,
    LuaMemberExpression,
    LuaIndexExpression,
    LuaIdentifier,
} from "../core/luaparse-types";
import { getDefinitionLoader } from "../definitions/definition-loader";
import type { FieldDefinition, FunctionDefinition, TableDefinition, GlobalDefinition } from "../definitions/definition-loader";

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
            currentType = symbol.type;
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
        if (type.kind === LuaTypeKind.TableType) {
            const tableType = type as LuaTableType;
            const field = tableType.fields.get(memberName);
            if (field) return field.type;
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
            if (symbol) return symbol.type;
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

        // Check library definitions (data-driven)
        if (definitionLoader.isNamespace(name)) {
            const libDef = definitionLoader.getLibrary(name);
            if (libDef) {
                return this.buildTableTypeFromDefinitions(libDef);
            }
        }

        // Check symbol table - note: in MemberProvider context we don't have builder reference
        // This is handled differently

        return LuaTypes.Unknown;
    }

    private resolveMemberType(baseType: LuaType, memberName: string): LuaType {
        if (baseType.kind === LuaTypeKind.TableType) {
            const tableType = baseType as LuaTableType;
            const field = tableType.fields.get(memberName);
            if (field) {
                return field.type;
            }
        }

        return LuaTypes.Unknown;
    }

    private addMemberCompletions(builder: CompletionBuilder, type: LuaType, colonCall = false): void {
        if (type.kind === LuaTypeKind.TableType) {
            const tableType = type as LuaTableType;

            tableType.fields.forEach((field) => {
                const isFunction = field.type.kind === LuaTypeKind.FunctionType;
                const item = this.createMemberCompletionItem(
                    field.name,
                    field.type,
                    isFunction,
                    colonCall
                );
                builder.addItem(item);
            });
        }
    }

    private createMemberCompletionItem(
        name: string,
        type: LuaType,
        isFunction: boolean,
        _colonCall: boolean
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

    private buildTableTypeFromDefinitions(def: TableDefinition): LuaType {
        if (!def.fields) return LuaTypes.Table;

        const fields = new Map<string, { name: string; type: LuaType }>();
        for (const [name, fieldDef] of Object.entries(def.fields)) {
            fields.set(name, {
                name,
                type: this.definitionToType(fieldDef),
            });
        }

        return { kind: LuaTypeKind.TableType, fields } as LuaTableType;
    }

    private buildTableTypeFromFields(fieldsObj: Record<string, FieldDefinition>): LuaType {
        const fields = new Map<string, { name: string; type: LuaType }>();
        for (const [name, fieldDef] of Object.entries(fieldsObj)) {
            fields.set(name, {
                name,
                type: this.definitionToType(fieldDef),
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
    const providers: CompletionProvider[] = [
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
 */
function determineTriggerStatus(
    document: LuaDocument,
    position: Position,
    triggerCharacter?: string
): CompletionTriggerStatus {
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
};
