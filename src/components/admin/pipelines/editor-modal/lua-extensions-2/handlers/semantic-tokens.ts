import type { SemanticTokens } from "../protocol";
import { SemanticTokenType, SemanticTokenModifier } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import { SymbolKind } from "../analysis/symbol-table";
import { LuaTypeKind } from "../analysis/type-system";
import {
    LuaNode,
    isIdentifier,
    isMemberExpression,
    isCallExpression,
    isStringCallExpression,
    isTableCallExpression,
    LuaIdentifier,
    LuaTableKeyString,
    LuaMemberExpression,
    LuaCallExpression,
    getChildren,
} from "../core/luaparse-types";
import { getDefinitionLoader } from "../definitions/definition-loader";

function isTableKeyString(node: LuaNode): node is LuaTableKeyString {
    return node.type === "TableKeyString";
}

// =============================================================================
// LEGEND
// =============================================================================

// Order matters! Must match the indices used in encoding.
export const TOKEN_TYPES: string[] = [
    SemanticTokenType.Namespace,
    SemanticTokenType.Type,
    SemanticTokenType.Class,
    SemanticTokenType.Enum,
    SemanticTokenType.Interface,
    SemanticTokenType.Struct,
    SemanticTokenType.TypeParameter,
    SemanticTokenType.Parameter,
    SemanticTokenType.Variable,
    SemanticTokenType.Property,
    SemanticTokenType.EnumMember,
    SemanticTokenType.Event,
    SemanticTokenType.Function,
    SemanticTokenType.Method,
    SemanticTokenType.Macro,
    SemanticTokenType.Keyword,
    SemanticTokenType.Modifier,
    SemanticTokenType.Comment,
    SemanticTokenType.String,
    SemanticTokenType.Number,
    SemanticTokenType.Regexp,
    SemanticTokenType.Operator,
    SemanticTokenType.Decorator,
];

export const TOKEN_MODIFIERS: string[] = [
    SemanticTokenModifier.Declaration,
    SemanticTokenModifier.Definition,
    SemanticTokenModifier.Readonly,
    SemanticTokenModifier.Static,
    SemanticTokenModifier.Deprecated,
    SemanticTokenModifier.Abstract,
    SemanticTokenModifier.Async,
    SemanticTokenModifier.Modification,
    SemanticTokenModifier.Documentation,
    SemanticTokenModifier.DefaultLibrary,
];

// Helper to get index
const TOKEN_TYPE_MAP = new Map<string, number>(TOKEN_TYPES.map((t, i) => [t, i]));
const TOKEN_MODIFIER_MAP = new Map<string, number>(TOKEN_MODIFIERS.map((t, i) => [t, i]));

// =============================================================================
// BUILDER
// =============================================================================

export class SemanticTokensBuilder {
    private data: number[] = [];
    private prevLine = 0;
    private prevChar = 0;

    push(line: number, char: number, length: number, tokenType: number, tokenModifiers: number): void {
        const deltaLine = line - this.prevLine;
        let deltaChar = char - this.prevChar;

        if (deltaLine !== 0) {
            deltaChar = char;
        }

        this.data.push(deltaLine, deltaChar, length, tokenType, tokenModifiers);

        this.prevLine = line;
        this.prevChar = char;
    }

    build(): SemanticTokens {
        return {
            data: this.data,
        };
    }
}

// =============================================================================
// TOKEN TYPES
// =============================================================================

interface SemanticTokenInfo {
    line: number;
    char: number;
    length: number;
    type: number;
    modifiers: number;
}

// Set to track processed offsets to avoid duplicates
type ProcessedOffsets = Set<number>;

// =============================================================================
// HANDLER
// =============================================================================

export function getSemanticTokens(
    document: LuaDocument,
    analysisResult: AnalysisResult
): SemanticTokens {
    const builder = new SemanticTokensBuilder();
    const tokens: SemanticTokenInfo[] = [];
    const processedOffsets: ProcessedOffsets = new Set();

    const ast = document.getAST();
    if (!ast) return builder.build();

    // Collect tokens with parent context
    collectTokensWithParent(ast, null, document, analysisResult, tokens, processedOffsets);

    // Sort tokens by position (required for delta encoding)
    tokens.sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        return a.char - b.char;
    });

    // Push to builder
    for (const token of tokens) {
        builder.push(token.line, token.char, token.length, token.type, token.modifiers);
    }

    return builder.build();
}

/**
 * Recursive token collector with parent context
 */
function collectTokensWithParent(
    node: LuaNode,
    parent: LuaNode | null,
    document: LuaDocument,
    result: AnalysisResult,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    if (!node.range) return;

    // Handle specific node types based on context
    if (isMemberExpression(node)) {
        handleMemberExpression(node as LuaMemberExpression, parent, document, result, tokens, processedOffsets);
    } else if (isCallExpression(node) || isStringCallExpression(node) || isTableCallExpression(node)) {
        handleCallExpression(node as LuaCallExpression, document, result, tokens, processedOffsets);
    } else if (isIdentifier(node)) {
        // Only handle standalone identifiers (not part of MemberExpression)
        // MemberExpression identifiers are handled by handleMemberExpression
        handleStandaloneIdentifier(node as LuaIdentifier, parent, document, result, tokens, processedOffsets);
    } else if (isTableKeyString(node)) {
        handleTableKeyString(node as LuaTableKeyString, document, tokens, processedOffsets);
    }

    // Handle literals (boolean, nil)
    handleLiteral(node, document, tokens, processedOffsets);

    // Handle operators in logical/binary expressions
    handleOperator(node, document, tokens, processedOffsets);

    // Recurse children with proper parent context
    const children = getChildren(node);
    for (const child of children) {
        collectTokensWithParent(child, node, document, result, tokens, processedOffsets);
    }
}

/**
 * Handle MemberExpression (e.g., helpers.matches, context.email)
 */
function handleMemberExpression(
    node: LuaMemberExpression,
    parent: LuaNode | null,
    document: LuaDocument,
    result: AnalysisResult,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    const loader = getDefinitionLoader();

    // Handle the base (e.g., 'helpers' in helpers.matches)
    if (isIdentifier(node.base)) {
        const baseName = (node.base as LuaIdentifier).name;
        const baseRange = node.base.range;
        if (baseRange && !processedOffsets.has(baseRange[0])) {
            processedOffsets.add(baseRange[0]);
            const basePos = document.offsetToPosition(baseRange[0]);
            const baseLength = baseRange[1] - baseRange[0];

            let type = -1;
            let modifiers = 0;

            // Check if it's a known namespace (data-driven)
            if (loader.isNamespace(baseName)) {
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Namespace)!;
                modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);

                // Check if readonly (like context)
                const meta = loader.getSandboxItemMetadata(baseName);
                if (meta?.isReadonly) {
                    modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!);
                }
            } else {
                // Check symbol table for local tables
                const symbol = result.symbolTable.lookupSymbol(baseName, baseRange[0]);
                if (symbol) {
                    type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
                }
            }

            if (type !== -1) {
                tokens.push({
                    line: basePos.line,
                    char: basePos.character,
                    length: baseLength,
                    type,
                    modifiers
                });
            }
        }
    }

    // Handle the member identifier (e.g., 'matches' in helpers.matches)
    const memberIdent = node.identifier;
    const memberRange = memberIdent.range;
    if (memberRange && !processedOffsets.has(memberRange[0])) {
        processedOffsets.add(memberRange[0]);
        const memberPos = document.offsetToPosition(memberRange[0]);
        const memberLength = memberRange[1] - memberRange[0];

        let type = -1;
        let modifiers = 0;

        // Determine if this member is being called (is it inside a CallExpression?)
        const isCallee = parent && (
            isCallExpression(parent) ||
            isStringCallExpression(parent) ||
            isTableCallExpression(parent)
        );

        // Check the base to determine context
        if (isIdentifier(node.base)) {
            const baseName = (node.base as LuaIdentifier).name;
            const memberName = memberIdent.name;

            // Check if base is a namespace (data-driven)
            if (loader.isNamespace(baseName)) {
                const memberDef = loader.getMemberDefinition(baseName, memberName);
                const meta = loader.getSandboxItemMetadata(baseName);

                if (memberDef?.kind === 'function') {
                    type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
                    modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
                } else if (memberDef?.kind === 'property' || meta?.hasHookVariants) {
                    // Properties (including context fields)
                    type = TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
                    if (meta?.isReadonly) {
                        modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!);
                    }
                } else if (memberDef) {
                    // Other member types
                    type = isCallee
                        ? TOKEN_TYPE_MAP.get(SemanticTokenType.Method)!
                        : TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
                    modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
                } else {
                    // Unknown member of known namespace
                    type = isCallee
                        ? TOKEN_TYPE_MAP.get(SemanticTokenType.Method)!
                        : TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
                }
            } else {
                // User-defined table member
                type = isCallee
                    ? TOKEN_TYPE_MAP.get(SemanticTokenType.Method)!
                    : TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
            }
        } else {
            // Base is not a simple identifier (e.g., chained access like a.b.c)
            type = isCallee
                ? TOKEN_TYPE_MAP.get(SemanticTokenType.Method)!
                : TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
        }

        // Method calls with : syntax
        if (node.indexer === ':') {
            type = TOKEN_TYPE_MAP.get(SemanticTokenType.Method)!;
        }

        if (type !== -1) {
            tokens.push({
                line: memberPos.line,
                char: memberPos.character,
                length: memberLength,
                type,
                modifiers
            });
        }
    }
}

/**
 * Handle CallExpression - the base might need special handling if it's a simple identifier
 */
function handleCallExpression(
    node: LuaCallExpression,
    document: LuaDocument,
    result: AnalysisResult,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    // If the base is a simple identifier (like print, tostring), mark it as a function
    if (isIdentifier(node.base)) {
        const ident = node.base as LuaIdentifier;
        const range = ident.range;
        if (range && !processedOffsets.has(range[0])) {
            processedOffsets.add(range[0]);
            const pos = document.offsetToPosition(range[0]);
            const length = range[1] - range[0];

            let type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
            let modifiers = 0;

            // Check if it's a known global function
            const loader = getDefinitionLoader();
            const globalDef = loader.getGlobal(ident.name);
            if (globalDef) {
                modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
            }

            // Check symbol table for local functions
            const symbol = result.symbolTable.lookupSymbol(ident.name, range[0]);
            if (symbol) {
                if (symbol.kind === SymbolKind.Function || symbol.type.kind === LuaTypeKind.FunctionType) {
                    // Already marked as Function
                } else {
                    // It's being called but might not be a known function type
                    type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
                }
            }

            tokens.push({
                line: pos.line,
                char: pos.character,
                length,
                type,
                modifiers
            });
        }
    }
    // MemberExpression bases are handled by handleMemberExpression
}

/**
 * Handle standalone identifiers (not part of MemberExpression or CallExpression base)
 */
function handleStandaloneIdentifier(
    node: LuaIdentifier,
    parent: LuaNode | null,
    document: LuaDocument,
    result: AnalysisResult,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    const range = node.range;
    if (!range) return;

    // Skip if already processed
    if (processedOffsets.has(range[0])) return;

    // Skip identifiers that are part of MemberExpression (handled separately)
    if (parent && isMemberExpression(parent)) {
        // Skip - will be handled by handleMemberExpression
        return;
    }

    // Skip identifiers that are direct callees (handled by handleCallExpression)
    if (parent && (isCallExpression(parent) || isStringCallExpression(parent) || isTableCallExpression(parent))) {
        const call = parent as LuaCallExpression;
        if (call.base === node) {
            // Skip - will be handled by handleCallExpression
            return;
        }
    }

    processedOffsets.add(range[0]);
    const startPos = document.offsetToPosition(range[0]);
    const length = range[1] - range[0];

    // Check symbol table
    const symbol = result.symbolTable.lookupSymbol(node.name, range[0]);

    let type = -1;
    let modifiers = 0;

    if (symbol) {
        switch (symbol.kind) {
            case SymbolKind.Parameter:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Parameter)!;
                break;
            case SymbolKind.Local:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
                if (symbol.type.kind === LuaTypeKind.FunctionType) {
                    type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
                }
                break;
            case SymbolKind.Global:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
                if (symbol.type.kind === LuaTypeKind.FunctionType) {
                    type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
                }
                modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Static)!);
                break;
            case SymbolKind.UpValue:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
                modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!);
                break;
            case SymbolKind.Function:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
                break;
            case SymbolKind.Method:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Method)!;
                break;
            case SymbolKind.Field:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
                break;
            default:
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
        }

        // Add Declaration modifier if this usage is the definition
        if (symbol.definitionOffset === range[0]) {
            modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Declaration)!);
        }

        // Phase G Item 15: Add Deprecated modifier if marked
        if (symbol.attributes?.isDeprecated) {
            modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Deprecated)!);
        }

    } else {
        // Fallback for globals/libs not in symbol table
        const loader = getDefinitionLoader();

        // Check sandbox items first (data-driven)
        const sandboxItem = loader.getSandboxItem(node.name);
        if (sandboxItem) {
            const meta = loader.getSandboxItemMetadata(node.name);
            if (meta?.semanticType === 'namespace') {
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Namespace)!;
                modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
                if (meta?.isReadonly) {
                    modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!);
                }
            } else if (meta?.semanticType === 'function') {
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
                modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
            }
        } else if (node.name === 'true' || node.name === 'false' || node.name === 'nil') {
            // Literals handled by base syntax highlighting
            return;
        } else if (loader.getGlobal(node.name)) {
            const globalDef = loader.getGlobal(node.name);
            if (globalDef?.kind === 'function') {
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Function)!;
            } else {
                type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
            }
            modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
            modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Static)!);
        } else if (loader.isNamespace(node.name)) {
            // Libraries
            type = TOKEN_TYPE_MAP.get(SemanticTokenType.Namespace)!;
            modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.DefaultLibrary)!);
            modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Static)!);
        }
    }

    // Special handling for `self`
    if (node.name === 'self') {
        type = TOKEN_TYPE_MAP.get(SemanticTokenType.Variable)!;
        modifiers |= (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!);
    }

    if (type !== -1) {
        tokens.push({
            line: startPos.line,
            char: startPos.character,
            length,
            type,
            modifiers
        });
    }
}

/**
 * Handle table key string (e.g., { allowed = true })
 */
function handleTableKeyString(
    node: LuaTableKeyString,
    document: LuaDocument,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    const range = node.key.range;
    if (!range) return;

    // Skip if already processed
    if (processedOffsets.has(range[0])) return;
    processedOffsets.add(range[0]);

    const startPos = document.offsetToPosition(range[0]);
    const length = range[1] - range[0];

    const type = TOKEN_TYPE_MAP.get(SemanticTokenType.Property)!;
    const modifiers = (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Declaration)!);

    tokens.push({
        line: startPos.line,
        char: startPos.character,
        length,
        type,
        modifiers
    });
}

/**
 * Handle literal values (boolean, nil) for semantic highlighting
 */
function handleLiteral(
    node: LuaNode,
    document: LuaDocument,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    // Handle BooleanLiteral (true, false)
    if (node.type === "BooleanLiteral") {
        const range = node.range;
        if (!range || processedOffsets.has(range[0])) return;
        processedOffsets.add(range[0]);

        const startPos = document.offsetToPosition(range[0]);
        const length = range[1] - range[0];

        // Use Keyword type with controlFlow modifier for true/false (VS Code uses blue for these)
        tokens.push({
            line: startPos.line,
            char: startPos.character,
            length,
            type: TOKEN_TYPE_MAP.get(SemanticTokenType.Keyword)!,
            modifiers: (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!)
        });
    }

    // Handle NilLiteral
    if (node.type === "NilLiteral") {
        const range = node.range;
        if (!range || processedOffsets.has(range[0])) return;
        processedOffsets.add(range[0]);

        const startPos = document.offsetToPosition(range[0]);
        const length = range[1] - range[0];

        // Use Keyword type for nil (VS Code uses blue for nil)
        tokens.push({
            line: startPos.line,
            char: startPos.character,
            length,
            type: TOKEN_TYPE_MAP.get(SemanticTokenType.Keyword)!,
            modifiers: (1 << TOKEN_MODIFIER_MAP.get(SemanticTokenModifier.Readonly)!)
        });
    }
}

/**
 * Handle operators in logical/binary/unary expressions
 * Specifically handles keyword operators: and, or, not
 */
function handleOperator(
    node: LuaNode,
    document: LuaDocument,
    tokens: SemanticTokenInfo[],
    processedOffsets: ProcessedOffsets
): void {
    const text = document.getText();

    // Handle LogicalExpression (and, or)
    if (node.type === "LogicalExpression") {
        const logicalNode = node as unknown as { operator: string; left: LuaNode; right: LuaNode; range?: [number, number] };
        const operator = logicalNode.operator;

        // Find operator position (after left operand, before right operand)
        if (logicalNode.left.range && logicalNode.right.range) {
            const searchStart = logicalNode.left.range[1];
            const searchEnd = logicalNode.right.range[0];
            const searchText = text.slice(searchStart, searchEnd);

            const opIndex = searchText.indexOf(operator);
            if (opIndex !== -1) {
                const opStart = searchStart + opIndex;
                if (!processedOffsets.has(opStart)) {
                    processedOffsets.add(opStart);
                    const startPos = document.offsetToPosition(opStart);

                    // "and" and "or" are keyword operators - use Keyword type
                    tokens.push({
                        line: startPos.line,
                        char: startPos.character,
                        length: operator.length,
                        type: TOKEN_TYPE_MAP.get(SemanticTokenType.Keyword)!,
                        modifiers: 0
                    });
                }
            }
        }
    }

    // Handle UnaryExpression (not, -, #)
    if (node.type === "UnaryExpression") {
        const unaryNode = node as unknown as { operator: string; argument: LuaNode; range?: [number, number] };
        const operator = unaryNode.operator;

        // Handle "not" keyword operator
        if (operator === "not" && unaryNode.range) {
            const opStart = unaryNode.range[0];
            if (!processedOffsets.has(opStart)) {
                processedOffsets.add(opStart);
                const startPos = document.offsetToPosition(opStart);

                tokens.push({
                    line: startPos.line,
                    char: startPos.character,
                    length: 3, // "not"
                    type: TOKEN_TYPE_MAP.get(SemanticTokenType.Keyword)!,
                    modifiers: 0
                });
            }
        }
    }
}
