import type { Position, Hover, Range } from "../../protocol";
import { MarkupKind } from "../../protocol";
import { type LuaDocument, getNodeRange } from "../../core/document";
import type { AnalysisResult } from "../../analysis/analyzer";
import { LuaTypeKind } from "../../analysis/type-system";
import { getSemanticInfo, resolveExpressionType } from "../../analysis/semantic-info";
import type { SemanticInfo } from '../../analysis/semantic-info';
import { getNarrowedType } from "../../analysis/condition-flow";
import {
    findNodePathAtOffset,
    isMemberExpression,
    isIdentifier,
    isLiteral,
    type LuaNode,
    type LuaMemberExpression,
    type LuaIdentifier,
    type LuaTableKeyString,
    type LuaExpression
} from "../../core/luaparse-types";
import { formatType } from "../../analysis/type-system";
import { getDefinitionLoader, type GlobalDefinition, type FieldDefinition } from "../../definitions/definition-loader";

import { HoverBuilder } from "./builder";
export { HoverBuilder };
import {
    buildDeclHover,
    buildMemberHover,
    buildDefinitionHover,
    buildGlobalDefinitionHover,
    buildKeywordHover,
    isKeyword,
    handleLiteralHover
} from "./content";

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

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
    const offset = document.positionToOffset(position);
    const ast = document.getAST();
    if (!ast) return null;

    const nodePath = findNodePathAtOffset(ast, offset);
    if (nodePath.length === 0) return null;

    const node = nodePath[nodePath.length - 1];
    const range = getNodeRange(document, node);

    // 1. Literal Hover (String, Number, Boolean)
    // Always prioritize this over keyword checks (e.g. "not" inside string)
    if (isLiteral(node)) {
        return handleLiteralHover(node, range);
    }

    // 2. Text-based Keyword fallback (Robustness)
    // Only perform this if we are not in a literal.
    // If we failed to find a valid AST node or the node is an Identifier/Keyword,
    // we assume text-based hover is safe.
    // But if node is StringLiteral, we already handled it or returned null.
    const word = document.getWordAtPosition(position);
    if (word && isKeyword(word)) {
        // Double check we are not inside a string if AST was successful but isLiteral failed (unlikely but safe)
        if (node.type === 'StringLiteral' || node.type === 'TableKeyString') {
            // For TableKeyString, it's a key, not a keyword.
            // But let the identifier logic handle TableKeyString.
            // Here we just want to avoid "not" in "not a valid domain"
            if (node.type === 'StringLiteral') return null;
        }
        return buildKeywordHover(word);
    }

    // 2. Keyword check
    // If we're here, we found an AST node.
    // If the text-based check above didn't catch it (unlikely if AST is valid),
    // we can check the identifier.
    if (node.type === 'Identifier' && isKeyword((node as LuaIdentifier).name)) {
        return buildKeywordHover((node as LuaIdentifier).name);
    }

    // 2. Keyword check
    // If the node is an identifier that matches a keyword, we might want to return null
    // or provide keyword documentation. For now, we skip keywords if they are identifiers.
    if (isIdentifier(node) && isKeyword(node.name)) {
        // Only skip if it's not a property access (e.g. t.end is valid)
        const parent = nodePath.length > 1 ? nodePath[nodePath.length - 2] : null;
        if (!parent || !isMemberExpression(parent) || (parent as LuaMemberExpression).identifier !== node) {
            return null;
        }
    }

    // 3. Identifier Hover (definitions, locals, globals)
    if (isIdentifier(node)) {
        // Check if this identifier is the property part of a MemberExpression
        // e.g. helpers.matches -> matches is the identifier, helpers.matches is the parent
        if (nodePath.length >= 2) {
            const parent = nodePath[nodePath.length - 2];
            if (isMemberExpression(parent) && (parent as LuaMemberExpression).identifier === node) {
                // It's the property part of a member expression.
                // We should resolve the whole member expression, NOT just the identifier "matches"
                // Pass the parent (MemberExpression) to semantic info
                const semanticInfo = getSemanticInfo(analysisResult, parent, { hookName: options.hookName });

                if (semanticInfo) {
                    // Use the range of the identifier for hover placement
                    return buildHoverFromSemanticInfo(document, analysisResult, semanticInfo, range);
                }
            }
        }

        return handleIdentifierHover(document, analysisResult, node as LuaIdentifier, range, options, nodePath);
    }

    // 4. Member Expression Hover (t.name)
    // Note: handleIdentifierHover handles the identifier part of member expression too
    // but sometimes we might want to handle the whole expression 
    // The previous implementation handled member expressions via identifier check mostly.

    // In EmmyLua, member expressions are handled by resolving the member on the base.
    // This is covered by handleIdentifierHover which checks if the identifier is part of a MemberExpression.

    // 4. Member Expression Hover (t.name)
    if (isMemberExpression(node)) {
        const semanticInfo = getSemanticInfo(analysisResult, node as LuaMemberExpression, { hookName: options.hookName });
        if (semanticInfo) {
            return buildHoverFromSemanticInfo(document, analysisResult, semanticInfo, range);
        }
    }

    return null;
}

/**
 * Build hover from SemanticInfo
 */
function buildHoverFromSemanticInfo(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    semanticInfo: SemanticInfo,
    range: Range
): Hover | null {
    const builder = new HoverBuilder(document, analysisResult);

    if (semanticInfo.declaration) {
        switch (semanticInfo.declaration.kind) {
            case 'member':
                if (semanticInfo.declaration.definition) {
                    const hover = buildDefinitionHover(semanticInfo.declaration.name, semanticInfo.declaration.definition);
                    return { ...hover, range };
                }
                break;
            case 'global':
                if (semanticInfo.declaration.definition) {
                    const hover = buildGlobalDefinitionHover(semanticInfo.declaration.name, semanticInfo.declaration.definition as GlobalDefinition);
                    return { ...hover, range };
                }
                break;
            case 'tableField':
                buildMemberHover(builder, semanticInfo.declaration.fieldName, semanticInfo.type);
                builder.setRange(range);
                return builder.build();
        }
    }

    // Fallback: type only
    if (semanticInfo.type.kind !== LuaTypeKind.Unknown) {
        // Assuming it's a member hover if we are here
        const name = semanticInfo.fieldName ?? (semanticInfo.declaration && 'name' in semanticInfo.declaration ? semanticInfo.declaration.name : '?');
        buildMemberHover(builder, name, semanticInfo.type);
        builder.setRange(range);
        return builder.build();
    }

    return null;
}

// =============================================================================
// HANDLERS
// =============================================================================

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
    const definitionLoader = getDefinitionLoader();

    // Check if this identifier is a key in a table constructor
    // e.g. { key = value } -> key uses TableKeyString
    if (nodePath.length >= 2) {
        const parent = nodePath[nodePath.length - 2];
        // luaparse produces TableKeyString for keys which contain identifier.
        // Parent of the identifier "key" is the TableKeyString node, NOT the TableConstructor.
        if (parent.type === 'TableKeyString' && (parent as LuaTableKeyString).key === ident) {
            // It is a key. 
            // Use resolveExpressionType to get proper type (handles nested tables)
            const valueNode = (parent as LuaTableKeyString).value;
            const valueType = resolveExpressionType(analysisResult, valueNode as LuaExpression);
            const typeStr = formatType(valueType, { multiline: true, maxDepth: 3 });

            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: `(field) **${name}**: \`${typeStr}\``,
                },
                range
            };
        }
    }

    // Check disabled globals
    if (definitionLoader.isDisabled(name)) {
        const message = definitionLoader.getDisabledMessage(name);
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `** ${name}** * (disabled) *\n\n⚠️ ${message} `,
            },
            range,
        };
    }

    // Check standard library / globals via Symbol Table first?
    // Symbol table handles locals, params, upvalues, and globals that are "seen".
    // But `getGlobal` from definition loader gives detailed docs.

    // Try Symbol Table (Locals, Params, Upvalues)
    const symbol = analysisResult.symbolTable.lookupSymbol(name, document.positionToOffset(range.start));
    if (symbol) {
        // Apply flow narrowing
        const narrowedType = getNarrowedType(analysisResult, symbol, document.positionToOffset(range.start));
        const builder = new HoverBuilder(document, analysisResult);
        buildDeclHover(builder, symbol, narrowedType);
        builder.setRange(range);
        return builder.build();
    }

    // Try new Semantic Info approach (EmmyLua style)
    // This handles globals, library members, and chained access relative to current position
    // Since we are at an identifier, we can pass it to getSemanticInfo
    // Try new Semantic Info approach (EmmyLua style)
    // Pass hookName to semantic info
    const semanticInfo = getSemanticInfo(analysisResult, ident, { hookName: options.hookName });

    if (semanticInfo) {
        const builder = new HoverBuilder(document, analysisResult);

        // If we have a declaration with definition, use it for rich hover info
        if (semanticInfo.declaration) {
            switch (semanticInfo.declaration.kind) {
                case 'member':
                    // Member has a definition from sandbox/library
                    if (semanticInfo.declaration.definition) {
                        const hover = buildDefinitionHover(name, semanticInfo.declaration.definition);
                        return { ...hover, range };
                    }
                    break;

                case 'global':
                    // Global definition (sandbox item or library)
                    if (semanticInfo.declaration.definition) {
                        const hover = buildGlobalDefinitionHover(name, semanticInfo.declaration.definition as GlobalDefinition);
                        return { ...hover, range };
                    }
                    break;

                case 'tableField':
                    // Local table field - use type directly
                    buildMemberHover(builder, name, semanticInfo.type);
                    builder.setRange(range);
                    return builder.build();
            }
        }

        // For isTableField flag (local tables), return type-only hover
        if (semanticInfo.isTableField && semanticInfo.type.kind !== LuaTypeKind.Unknown) {
            buildMemberHover(builder, name, semanticInfo.type);
            builder.setRange(range);
            return builder.build();
        }
    }

    // Check global definitions directly (fallback for robust global hover)
    const globalDef = definitionLoader.getGlobal(name);
    if (globalDef) {
        // Prefer symbol table if it was shadowed, but we checked symbol table above.
        // However, symbol table might have "global" symbol without docs.
        // definitionLoader has docs.
        const hover = buildGlobalDefinitionHover(name, globalDef);
        return { ...hover, range };
    }

    // Check sandbox items
    const sandboxItem = definitionLoader.getSandboxItem(name);
    if (sandboxItem) {
        // Adapt SandboxItemDefinition to FieldDefinition/GlobalDefinition structure for hover builder
        const hover = buildDefinitionHover(name, sandboxItem as unknown as FieldDefinition); // close enough casting
        return { ...hover, range };
    }

    return null;
}
