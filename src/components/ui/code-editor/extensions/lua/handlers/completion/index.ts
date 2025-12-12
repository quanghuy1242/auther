import type { Position, CompletionItem } from "../../protocol";
import type { LuaDocument } from "../../core/document";
import type { AnalysisResult } from "../../analysis/analyzer";
import { findNodePathAtOffset, isCallExpression, isTableConstructor, type LuaCallExpression } from "../../core/luaparse-types";

import { CompletionBuilder } from "./builder";
import { CompletionTriggerStatus, type CompletionProvider } from "./types";

import { DocTagProvider } from "./providers/doc-tags";
import { DocTypeProvider } from "./providers/doc-types";
import { DocNameTokenProvider } from "./providers/doc-names";
import { DescProvider } from "./providers/doc-desc";
import { PostfixProvider } from "./providers/postfix";
import { EqualityProvider } from "./providers/equality";
import { FunctionArgProvider } from "./providers/function-args";
import { TableFieldProvider } from "./providers/table-fields";
import { MemberProvider } from "./providers/members";
import { EnvProvider } from "./providers/environment";
import { KeywordsProvider } from "./providers/keywords";

// =============================================================================
// COMPLETION OPTIONS
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

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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

export type { CompletionProvider };
export { CompletionTriggerStatus } from "./types";
export { CompletionBuilder } from "./builder";
export * from "./providers/doc-tags";
export * from "./providers/doc-types";
export * from "./providers/doc-names";
export * from "./providers/doc-desc";
export * from "./providers/postfix";
export * from "./providers/equality";
export * from "./providers/function-args";
export * from "./providers/table-fields";
export * from "./providers/members";
export * from "./providers/environment";
export * from "./providers/keywords";
