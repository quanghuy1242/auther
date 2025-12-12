// =============================================================================
// COMPLETION SOURCE
// =============================================================================
// CodeMirror completion source that uses the LSP-style getCompletions handler

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getCompletions } from "../handlers/completion";
import { CompletionItemKind, type CompletionItem } from "../protocol";

// =============================================================================
// OPTIONS
// =============================================================================

export interface CompletionSourceOptions {
    /** Current hook name for context-aware completions */
    hookName?: string;
    /** Previous script code for context.prev inference */
    previousScriptCode?: string;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// COMPLETION ITEM CONVERSION
// =============================================================================

/**
 * Map LSP CompletionItemKind to CodeMirror completion type
 */
function kindToType(kind: CompletionItemKind): string {
    switch (kind) {
        case CompletionItemKind.Function:
        case CompletionItemKind.Method:
            return "function";
        case CompletionItemKind.Variable:
            return "variable";
        case CompletionItemKind.Property:
        case CompletionItemKind.Field:
            return "property";
        case CompletionItemKind.Keyword:
            return "keyword";
        case CompletionItemKind.Class:
        case CompletionItemKind.Module:
            return "class";
        case CompletionItemKind.Constant:
            return "constant";
        case CompletionItemKind.Snippet:
            return "text";
        default:
            return "text";
    }
}

/**
 * Convert LSP CompletionItem to CodeMirror Completion
 */
function toCodeMirrorCompletion(item: CompletionItem): Completion {
    const completion: Completion = {
        label: item.label,
        type: kindToType(item.kind ?? CompletionItemKind.Text),
        detail: item.detail,
        boost: item.sortText ? -parseInt(item.sortText, 10) : 0,
    };

    // Add documentation
    if (item.documentation) {
        const doc = typeof item.documentation === "string"
            ? item.documentation
            : item.documentation.value;

        completion.info = () => {
            const div = window.document.createElement("div");
            div.className = "cm-completion-info-lua";

            // Simple markdown-to-HTML conversion
            const html = doc
                .replace(/`([^`]+)`/g, "<code>$1</code>")
                .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
                .replace(/\n\n/g, "</p><p>")
                .replace(/\n/g, "<br>");

            div.innerHTML = `<p>${html}</p>`;
            return div;
        };
    }

    // Handle insertText and textEdit
    if (item.insertText) {
        completion.apply = item.insertText;
    }

    return completion;
}

// =============================================================================
// COMPLETION SOURCE
// =============================================================================

/**
 * Create a CodeMirror completion source using the LSP-style handler
 */
export function createCompletionSource(
    options: CompletionSourceOptions = {}
): (context: CompletionContext) => CompletionResult | null {
    const { hookName, previousScriptCode, documentUri = "file://untitled" } = options;

    return (context: CompletionContext): CompletionResult | null => {
        const code = context.state.doc.toString();
        const pos = context.pos;

        // Create document and analyze
        const luaDoc = new LuaDocument(documentUri, code);
        const analysisResult = analyzeDocument(luaDoc, { hookName, previousScriptCode });

        // Get LSP-style position
        const position = luaDoc.offsetToPosition(pos);

        // Determine trigger character
        const triggerMatch = context.matchBefore(/\./);
        const triggerCharacter = triggerMatch ? "." : undefined;

        // Get completions from handler
        const items = getCompletions(luaDoc, analysisResult, position, triggerCharacter, {
            hookName,
            isExplicit: context.explicit,
        });

        if (items.length === 0) {
            return null;
        }

        // Determine completion range
        // Match word characters or after a dot
        const word = context.matchBefore(/[\w_]*$/);
        const from = word ? word.from : pos;

        // Convert to CodeMirror completions
        const completions = items.map(toCodeMirrorCompletion);

        return {
            from,
            options: completions,
            validFor: /^[\w_]*$/,
        };
    };
}
