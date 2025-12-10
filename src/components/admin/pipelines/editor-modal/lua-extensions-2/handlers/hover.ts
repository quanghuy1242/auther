// =============================================================================
// HOVER HANDLER
// =============================================================================
// Provides hover information for the Lua editor
// Inspired by EmmyLua's handlers/hover module structure
// See: emmylua_ls/src/handlers/hover/

import type { Position, Hover, Range } from "../protocol";
import { createRange, MarkupKind, type MarkupContent } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import type { Symbol } from "../analysis/symbol-table";
import { SymbolKind } from "../analysis/symbol-table";
import type {
    LuaType,
    LuaFunctionType,
} from "../analysis/type-system";
import { LuaTypeKind, formatType } from "../analysis/type-system";
import {
    findNodePathAtOffset,
    isMemberExpression,
    isIdentifier,
    isLiteral,
} from "../core/luaparse-types";
import type {
    LuaNode,
    LuaMemberExpression,
    LuaIdentifier,
    LuaStringLiteral,
    LuaNumericLiteral,
    LuaBooleanLiteral,
    LuaTableKeyString,
} from "../core/luaparse-types";
import { getDefinitionLoader } from "../definitions/definition-loader";
import type {
    FieldDefinition,
    FunctionDefinition,
    PropertyDefinition,
    GlobalDefinition,
} from "../definitions/definition-loader";

// =============================================================================
// HOVER BUILDER
// =============================================================================

/**
 * Builder for constructing hover content
 * Following EmmyLua's HoverBuilder pattern
 */
export class HoverBuilder {
    private typeDescription: string | null = null;
    private locationPath: string | null = null;
    private description: string | null = null;
    private paramDescriptions: Map<string, string> = new Map();
    private returnDescription: string | null = null;
    private range: Range | null = null;

    constructor(
        readonly document: LuaDocument,
        readonly analysisResult: AnalysisResult
    ) { }

    /**
     * Set the type description (e.g., "local x: number")
     */
    setTypeDescription(desc: string): this {
        this.typeDescription = desc;
        return this;
    }

    /**
     * Set the location path (e.g., "helpers.fetch")
     */
    setLocationPath(path: string): this {
        this.locationPath = path;
        return this;
    }

    /**
     * Set the main description/documentation
     */
    setDescription(desc: string): this {
        this.description = desc;
        return this;
    }

    /**
     * Add a parameter description
     */
    addParamDescription(name: string, desc: string): this {
        this.paramDescriptions.set(name, desc);
        return this;
    }

    /**
     * Set the return description
     */
    setReturnDescription(desc: string): this {
        this.returnDescription = desc;
        return this;
    }

    /**
     * Set the hover range
     */
    setRange(range: Range): this {
        this.range = range;
        return this;
    }

    /**
     * Build the hover result
     */
    build(): Hover | null {
        const contents = this.buildContents();
        if (!contents) return null;

        return {
            contents,
            range: this.range ?? undefined,
        };
    }

    private buildContents(): MarkupContent | null {
        const parts: string[] = [];

        // Type signature in code block
        if (this.typeDescription) {
            parts.push("```lua\n" + this.typeDescription + "\n```");
        }

        // Location path
        if (this.locationPath) {
            parts.push(`*${this.locationPath}*`);
        }

        // Main description
        if (this.description) {
            parts.push(this.description);
        }

        // Parameter descriptions
        if (this.paramDescriptions.size > 0) {
            const paramLines: string[] = [];
            this.paramDescriptions.forEach((desc, name) => {
                paramLines.push(`@*param* \`${name}\` — ${desc}`);
            });
            parts.push(paramLines.join("\n\n"));
        }

        // Return description
        if (this.returnDescription) {
            parts.push(`@*return* — ${this.returnDescription}`);
        }

        if (parts.length === 0) return null;

        return {
            kind: MarkupKind.Markdown,
            value: parts.join("\n\n"),
        };
    }
}

// =============================================================================
// HOVER CONTENT BUILDERS
// =============================================================================

/**
 * Build hover content for a declaration (variable, parameter, etc.)
 * Following EmmyLua's build_decl_hover pattern
 */
function buildDeclHover(
    builder: HoverBuilder,
    symbol: Symbol,
    type: LuaType
): void {
    const prefix = symbol.kind === SymbolKind.Local
        ? "local "
        : symbol.kind === SymbolKind.Parameter
            ? "(parameter) "
            : symbol.kind === SymbolKind.UpValue
                ? "(upvalue) "
                : symbol.kind === SymbolKind.LoopVariable
                    ? "(loop variable) "
                    : symbol.kind === SymbolKind.Global
                        ? "(global) "
                        : "";

    // Check if it's a function
    if (type.kind === LuaTypeKind.FunctionType) {
        const fnType = type as LuaFunctionType;
        const signature = formatFunctionSignature(symbol.name, fnType);
        builder.setTypeDescription(prefix + signature);
    } else {
        const typeStr = formatType(type, { multiline: true });
        builder.setTypeDescription(`${prefix}${symbol.name}: ${typeStr}`);
    }

    if (symbol.documentation) {
        builder.setDescription(symbol.documentation);
    }
}

/**
 * Build hover content for a member (field, method)
 * Following EmmyLua's build_member_hover pattern
 */
function buildMemberHover(
    builder: HoverBuilder,
    memberName: string,
    type: LuaType,
    definition?: FieldDefinition
): void {
    if (type.kind === LuaTypeKind.FunctionType) {
        const fnType = type as LuaFunctionType;
        const signature = formatFunctionSignature(memberName, fnType);
        builder.setTypeDescription(`(method) ${signature}`);

        // Add param descriptions from definition
        if (definition && definition.kind === "function") {
            const fnDef = definition as FunctionDefinition;
            if (fnDef.params) {
                for (const param of fnDef.params) {
                    if (param.description) {
                        builder.addParamDescription(param.name, param.description);
                    }
                }
            }
            if (fnDef.returns?.description) {
                builder.setReturnDescription(fnDef.returns.description);
            }
        }
    } else {
        const typeStr = formatType(type, { multiline: true });
        builder.setTypeDescription(`(field) ${memberName}: ${typeStr}`);
    }

    if (definition?.description) {
        builder.setDescription(definition.description);
    }
}

/**
 * Build hover content for a keyword
 * Following EmmyLua's keyword_hover.rs
 */
function buildKeywordHover(keyword: string): Hover | null {
    const keywordDocs: Record<string, string> = {
        and: "Logical AND operator. Returns the first operand if it is falsy, otherwise returns the second operand.",
        or: "Logical OR operator. Returns the first operand if it is truthy, otherwise returns the second operand.",
        not: "Logical NOT operator. Returns `true` if the operand is falsy, otherwise returns `false`.",
        if: "Conditional statement. Executes code if the condition is truthy.\n\n```lua\nif condition then\n    -- code\nelseif other_condition then\n    -- code\nelse\n    -- code\nend\n```",
        then: "Part of an `if` statement. Follows the condition.",
        else: "Part of an `if` statement. Executes if all conditions are falsy.",
        elseif: "Part of an `if` statement. Adds an additional condition to check.",
        end: "Ends a block (`function`, `if`, `for`, `while`, `repeat`, `do`).",
        for: "Loop statement. Iterates over a range or iterator.\n\n```lua\n-- Numeric for\nfor i = 1, 10 do\n    -- code\nend\n\n-- Generic for\nfor k, v in pairs(t) do\n    -- code\nend\n```",
        while: "Loop statement. Executes while the condition is truthy.\n\n```lua\nwhile condition do\n    -- code\nend\n```",
        repeat: "Loop statement. Executes until the condition is truthy.\n\n```lua\nrepeat\n    -- code\nuntil condition\n```",
        until: "Part of a `repeat` loop. Specifies the exit condition.",
        do: "Starts a block, or part of a `while`/`for` loop.",
        break: "Exits the innermost loop.",
        return: "Returns from a function with optional values.\n\n```lua\nreturn value1, value2\n```",
        function: "Declares a function.\n\n```lua\nfunction name(params)\n    -- body\nend\n\nlocal f = function(params)\n    -- body\nend\n```",
        local: "Declares a local variable or function.\n\n```lua\nlocal x = 10\nlocal function f() end\n```",
        nil: "The nil type and value. Represents the absence of a value.",
        true: "Boolean true value.",
        false: "Boolean false value.",
        in: "Part of a generic `for` loop. Separates variables from the iterator.",
        goto: "Jumps to a label.\n\n```lua\ngoto label\n::label::\n```",
    };

    const doc = keywordDocs[keyword];
    if (!doc) return null;

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: `**${keyword}** *(keyword)*\n\n${doc}`,
        },
    };
}

/**
 * Build hover for standard library items
 * Following EmmyLua's std_hover.rs
 */
function buildStdHover(name: string): Hover | null {
    const definitionLoader = getDefinitionLoader();

    // Check global functions
    const globalDef = definitionLoader.getGlobal(name);
    if (globalDef) {
        return buildGlobalDefinitionHover(name, globalDef);
    }

    return null;
}

/**
 * Build hover from a GlobalDefinition
 */
function buildGlobalDefinitionHover(name: string, def: GlobalDefinition): Hover {
    const parts: string[] = [];

    // Type signature
    if (def.kind === "function") {
        parts.push("```lua\n" + (def.signature ?? `function ${name}()`) + "\n```");
    } else if (def.kind === "property") {
        parts.push("```lua\n" + `${name}: ${def.type ?? "unknown"}` + "\n```");
    } else if (def.kind === "table") {
        parts.push("```lua\n" + `${name}: table` + "\n```");
    }

    // Description
    if (def.description) {
        parts.push(def.description);
    }

    // Parameters
    if (def.kind === "function" && def.params && def.params.length > 0) {
        const paramDocs = def.params
            .filter((p) => p.description)
            .map((p) => `@*param* \`${p.name}\` — ${p.description}`)
            .join("\n\n");
        if (paramDocs) {
            parts.push(paramDocs);
        }
    }

    if (def.returns?.description) {
        parts.push(`@*return* — ${def.returns.description}`);
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: parts.join("\n\n"),
        },
    };
}

/**
 * Build hover from a FieldDefinition
 */
function buildDefinitionHover(name: string, def: FieldDefinition): Hover {
    const parts: string[] = [];

    // Type signature
    if (def.kind === "function") {
        const fnDef = def as FunctionDefinition;
        parts.push("```lua\n" + (fnDef.signature ?? `function ${name}()`) + "\n```");
    } else if (def.kind === "property") {
        const propDef = def as PropertyDefinition;
        parts.push("```lua\n" + `${name}: ${propDef.type}` + "\n```");
    } else if (def.kind === "table") {
        parts.push("```lua\n" + `${name}: table` + "\n```");
    }

    // Description
    if (def.description) {
        parts.push(def.description);
    }

    // Parameters
    if (def.kind === "function") {
        const fnDef = def as FunctionDefinition;
        if (fnDef.params && fnDef.params.length > 0) {
            const paramDocs = fnDef.params
                .filter((p) => p.description)
                .map((p) => `@*param* \`${p.name}\` — ${p.description}`)
                .join("\n\n");
            if (paramDocs) {
                parts.push(paramDocs);
            }
        }

        if (fnDef.returns?.description) {
            parts.push(`@*return* — ${fnDef.returns.description}`);
        }
    }

    // Example
    if (def.kind === "function") {
        const fnDef = def as FunctionDefinition;
        if (fnDef.example) {
            parts.push("**Example:**\n```lua\n" + fnDef.example + "\n```");
        }
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: parts.join("\n\n"),
        },
    };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format a function signature for display
 */
function formatFunctionSignature(name: string, fnType: LuaFunctionType): string {
    const params = fnType.params
        .map((p) => {
            let paramStr = p.name;
            if (p.optional) paramStr += "?";
            paramStr += ": " + formatType(p.type);
            return paramStr;
        })
        .join(", ");

    const returns = fnType.returns.length > 0
        ? fnType.returns.map((t) => formatType(t)).join(", ")
        : "void";

    return `function ${name}(${params}): ${returns}`;
}

/**
 * Check if a string is a Lua keyword
 */
function isKeyword(str: string): boolean {
    const keywords = new Set([
        "and", "break", "do", "else", "elseif", "end", "false", "for",
        "function", "goto", "if", "in", "local", "nil", "not", "or",
        "repeat", "return", "then", "true", "until", "while",
    ]);
    return keywords.has(str);
}

// =============================================================================
// MAIN HOVER HANDLER
// =============================================================================

/**
 * Options for hover handling
 */
export interface HoverOptions {
    /** Current hook name for context-aware information */
    hookName?: string;
}

/**
 * Main hover handler following EmmyLua's on_hover pattern
 */
export function getHover(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    position: Position,
    options: HoverOptions = {}
): Hover | null {
    const ast = document.getAST();
    if (!ast) return null;

    const offset = document.positionToOffset(position);

    // Find token/node at position
    const nodePath = findNodePathAtOffset(ast, offset);
    if (nodePath.length === 0) return null;

    const node = nodePath[nodePath.length - 1];

    // Skip hover inside string literals and comments
    // Check if the innermost node is a string literal
    if (node.type === "StringLiteral") {
        // Don't provide hover for content inside strings
        return null;
    }

    // Check if we're inside a comment
    const comments = document.getComments();
    for (const comment of comments) {
        if (comment.range && offset >= comment.range[0] && offset <= comment.range[1]) {
            // Inside a comment, no hover
            return null;
        }
    }

    // Get the text at cursor
    const word = getWordAtPosition(document, position);
    if (!word) return null;

    // Check for keyword (only if not inside string/comment - already checked above)
    if (isKeyword(word)) {
        return buildKeywordHover(word);
    }

    // Build range from node
    const range = getNodeRange(document, node);

    // Handle different node types
    if (isIdentifier(node)) {
        // Check if this identifier is the property part of a MemberExpression
        // e.g. helpers.matches -> matches is the identifier, helpers.matches is the parent
        if (nodePath.length >= 2) {
            const parent = nodePath[nodePath.length - 2];
            if (isMemberExpression(parent) && parent.identifier === node) {
                return handleMemberExpressionHover(document, analysisResult, parent, options);
            }
        }

        return handleIdentifierHover(document, analysisResult, node as LuaIdentifier, range, options, nodePath);
    }

    if (isMemberExpression(node)) {
        return handleMemberExpressionHover(document, analysisResult, node as LuaMemberExpression, options);
    }

    // Handle literals
    if (isLiteral(node)) {
        return handleLiteralHover(node, range);
    }

    return null;
}

/**
 * Handle hover for an identifier
 */
function handleIdentifierHover(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    ident: LuaIdentifier,
    range: Range,
    options: HoverOptions,
    nodePath: LuaNode[]
): Hover | null {
    const name = ident.name;

    // Check if this identifier is a key in a table constructor
    // e.g. { key = value } -> key uses TableKeyString
    // Check if this identifier is a key in a table constructor
    // e.g. { key = value } -> key uses TableKeyString
    if (nodePath.length >= 2) {
        const parent = nodePath[nodePath.length - 2];
        if (parent.type === "TableKeyString" && (parent as LuaTableKeyString).key === ident) {
            // It's a table key. Try to determine the type of the value.
            const valueNode = (parent as LuaTableKeyString).value;
            let typeStr = "unknown";

            if (valueNode && valueNode.range) {
                const type = analysisResult.types.get(valueNode.range[0]);
                if (type) {
                    typeStr = formatType(type, { multiline: true });
                }
            }

            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `(field) **${name}**: \`${typeStr}\``,
                },
                range,
            };
        }
    }

    // Check symbol table first
    const symbol = analysisResult.symbolTable.lookupSymbol(name, ident.range?.[0]);
    if (symbol) {
        const builder = new HoverBuilder(document, analysisResult);
        buildDeclHover(builder, symbol, symbol.type);
        builder.setRange(range);
        return builder.build();
    }

    // Check standard library
    const stdHover = buildStdHover(name);
    if (stdHover) {
        return { ...stdHover, range };
    }

    // Check sandbox globals (data-driven)
    const definitionLoader = getDefinitionLoader();

    const sandboxItem = definitionLoader.getSandboxItem(name);
    if (sandboxItem) {
        const meta = definitionLoader.getSandboxItemMetadata(name);
        if (sandboxItem.kind === 'function') {
            // Function like await
            const hover = buildDefinitionHover(name, sandboxItem as FunctionDefinition);
            return { ...hover, range };
        } else {
            // Table like helpers or context
            const description = sandboxItem.description ?? '';
            const typeInfo = meta?.hasHookVariants
                ? 'Hook context containing event data and previous script results.\n\nFields include `trigger_event`, `prev`, `outputs`, and hook-specific data.'
                : description;
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `\`\`\`lua\n${name}: table\n\`\`\`\n\n${typeInfo}`,
                },
                range,
            };
        }
    }

    // Check disabled globals
    if (definitionLoader.isDisabled(name)) {
        const message = definitionLoader.getDisabledMessage(name);
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `**${name}** *(disabled)*\n\n⚠️ ${message}`,
            },
            range,
        };
    }

    return null;
}

/**
 * Handle hover for a member expression (e.g., helpers.fetch)
 */
function handleMemberExpressionHover(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    expr: LuaMemberExpression,
    options: HoverOptions
): Hover | null {
    const definitionLoader = getDefinitionLoader();
    const memberName = expr.identifier.name;
    const range = getNodeRange(document, expr.identifier);

    // Get base type
    if (isIdentifier(expr.base)) {
        const baseName = (expr.base as LuaIdentifier).name;

        // Handle sandbox item members (data-driven)
        const sandboxItem = definitionLoader.getSandboxItem(baseName);
        if (sandboxItem) {
            if (definitionLoader.hasHookVariants(baseName)) {
                // Hook-variant item (like context)
                const contextFields = definitionLoader.getContextFieldsForHook(options.hookName);
                const fieldDef = contextFields[memberName];
                if (fieldDef) {
                    const hover = buildDefinitionHover(memberName, fieldDef);
                    return { ...hover, range };
                }
            } else if (sandboxItem.fields?.[memberName]) {
                const fieldDef = sandboxItem.fields[memberName];
                const hover = buildDefinitionHover(memberName, fieldDef);
                return { ...hover, range };
            }
        }

        // Handle library.* hover (e.g., string.sub, math.floor)
        const libMethod = definitionLoader.getLibraryMethod(baseName, memberName);
        if (libMethod) {
            const hover = buildDefinitionHover(memberName, libMethod);
            return { ...hover, range };
        }
    }

    // Fallback: use inferred type
    if (expr.range) {
        const type = analysisResult.types.get(expr.range[0]);
        if (type) {
            const builder = new HoverBuilder(document, analysisResult);
            buildMemberHover(builder, memberName, type);
            builder.setRange(range);
            return builder.build();
        }
    }

    return null;
}

/**
 * Handle hover for literal values
 */
function handleLiteralHover(node: LuaNode, range: Range): Hover | null {
    const nodeType = node.type;

    if (nodeType === "StringLiteral") {
        const value = (node as LuaStringLiteral).value;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`"${value}"\`: string`,
            },
            range,
        };
    }

    if (nodeType === "NumericLiteral") {
        const value = (node as LuaNumericLiteral).value;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`${value}\`: number`,
            },
            range,
        };
    }

    if (nodeType === "BooleanLiteral") {
        const value = (node as LuaBooleanLiteral).value;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`${value}\`: boolean`,
            },
            range,
        };
    }

    if (nodeType === "NilLiteral") {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: "`nil`: nil\n\nThe absence of any useful value.",
            },
            range,
        };
    }

    return null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get the word at the given position
 */
function getWordAtPosition(document: LuaDocument, position: Position): string | null {
    const line = document.getLine(position.line);
    if (!line) return null;

    let start = position.character;
    let end = position.character;

    // Expand backward
    while (start > 0 && /[\w_]/.test(line[start - 1])) {
        start--;
    }

    // Expand forward
    while (end < line.length && /[\w_]/.test(line[end])) {
        end++;
    }

    if (start === end) return null;
    return line.slice(start, end);
}

/**
 * Get the range of a node in the document
 */
function getNodeRange(document: LuaDocument, node: LuaNode): Range {
    if (node.loc) {
        return document.locToRange(node.loc);
    }
    if (node.range) {
        return document.offsetRangeToRange(node.range[0], node.range[1]);
    }
    return createRange({ line: 0, character: 0 }, { line: 0, character: 0 });
}
