// =============================================================================
// GO-TO-DEFINITION SOURCE
// =============================================================================
// CodeMirror extension for Ctrl+Click go-to-definition using the LSP handler

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getDefinition } from "../handlers/definition";

// =============================================================================
// OPTIONS
// =============================================================================

export interface GotoDefinitionOptions {
    /** Current hook name for context */
    hookName?: string;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// EXTENSION FACTORY
// =============================================================================

/**
 * Create a go-to-definition extension that handles Ctrl+Click
 */
export function createGotoDefinition(options: GotoDefinitionOptions = {}): Extension {
    const { hookName, documentUri = "file://untitled" } = options;

    return EditorView.domEventHandlers({
        click(event: MouseEvent, view: EditorView) {
            // Check for Ctrl+Click (or Cmd+Click on Mac)
            if (!event.ctrlKey && !event.metaKey) return false;

            // Get position in document
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;

            const code = view.state.doc.toString();

            // Create document and analyze
            const luaDoc = new LuaDocument(documentUri, code);
            const analysisResult = analyzeDocument(luaDoc, { hookName });

            // Get LSP-style position
            const position = luaDoc.offsetToPosition(pos);

            // Get definition
            const result = getDefinition(luaDoc, analysisResult, position, {
                hookName,
                documentUri,
            });

            if (!result) return false;

            // Check if it's a builtin (can't jump to)
            if (result.isBuiltin) {
                // Could show a message that this is a builtin definition
                showBuiltinMessage(view, result.builtinName ?? "builtin");
                event.preventDefault();
                return true;
            }

            // Get target position
            const targetPos = luaDoc.positionToOffset(result.location.range.start);

            // Don't jump if we're at the same position
            if (Math.abs(targetPos - pos) < 5) return false;

            // Jump to definition
            view.dispatch({
                selection: { anchor: targetPos },
                scrollIntoView: true,
            });

            event.preventDefault();
            return true;
        },
    });
}

/**
 * Show a brief message for builtin definitions
 */
function showBuiltinMessage(view: EditorView, name: string): void {
    // Create a temporary tooltip-like message
    const message = window.document.createElement("div");
    message.className = "cm-goto-definition-message";
    message.textContent = `${name} is a builtin definition`;
    message.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #282c34;
        color: #abb2bf;
        padding: 8px 16px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 9999;
        font-size: 13px;
    `;

    window.document.body.appendChild(message);

    setTimeout(() => {
        message.remove();
    }, 2000);
}
