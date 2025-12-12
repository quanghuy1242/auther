// =============================================================================
// FIND REFERENCES SOURCE
// =============================================================================
// CodeMirror extension for finding references using the LSP handler

import { EditorView, Decoration, type DecorationSet, keymap } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getReferences, type Reference } from "../handlers/references";

// =============================================================================
// OPTIONS
// =============================================================================

export interface FindReferencesOptions {
    /** Current hook name for context */
    hookName?: string;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/**
 * Effect to set reference highlights
 */
const setReferences = StateEffect.define<Reference[]>();
const clearReferences = StateEffect.define<void>();

/**
 * Decoration for reference highlights
 */
const referenceHighlight = Decoration.mark({
    class: "cm-reference-highlight",
});

/**
 * State field to track reference highlights
 */
const referencesField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, tr) {
        for (const e of tr.effects) {
            if (e.is(setReferences)) {
                const refs = e.value;
                const newDecorations: { from: number; to: number }[] = [];

                for (const ref of refs) {
                    const from = tr.state.doc.line(ref.location.range.start.line + 1).from +
                        ref.location.range.start.character;
                    const to = tr.state.doc.line(ref.location.range.end.line + 1).from +
                        ref.location.range.end.character;

                    newDecorations.push({ from, to });
                }

                return Decoration.set(
                    newDecorations.map((r) => referenceHighlight.range(r.from, r.to))
                );
            }
            if (e.is(clearReferences)) {
                return Decoration.none;
            }
        }

        // Clear on cursor movement or document change
        if (tr.docChanged || tr.selection) {
            return Decoration.none;
        }

        return decorations;
    },
    provide: (f) => EditorView.decorations.from(f),
});

// =============================================================================
// FIND REFERENCES LOGIC
// =============================================================================

/**
 * Find and highlight all references at the current position
 */
function findAndHighlightReferences(
    view: EditorView,
    hookName?: string,
    documentUri = "file://untitled"
): boolean {
    const pos = view.state.selection.main.head;
    const code = view.state.doc.toString();

    // Create document and analyze
    const luaDoc = new LuaDocument(documentUri, code);
    const analysisResult = analyzeDocument(luaDoc, { hookName });

    // Get LSP-style position
    const position = luaDoc.offsetToPosition(pos);

    // Get references
    const refs = getReferences(luaDoc, analysisResult, position, {
        includeDeclaration: true,
        documentUri,
    });

    if (refs.length === 0) {
        return false;
    }

    // Show references count
    showReferencesInfo(view, refs.length);

    // Highlight all references
    view.dispatch({
        effects: setReferences.of(refs),
    });

    return true;
}

/**
 * Clear reference highlights
 */
function clearReferenceHighlights(view: EditorView): void {
    view.dispatch({
        effects: clearReferences.of(),
    });
}

/**
 * Show references info panel
 */
function showReferencesInfo(view: EditorView, count: number): void {
    const message = window.document.createElement("div");
    message.className = "cm-references-info";
    message.textContent = `Found ${count} reference${count !== 1 ? "s" : ""}`;
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

// =============================================================================
// EXTENSION FACTORY
// =============================================================================

/**
 * Create a find-references extension with Shift+F12 keybinding
 */
export function createFindReferences(options: FindReferencesOptions = {}): Extension {
    const { hookName, documentUri } = options;

    return [
        referencesField,

        // Shift+F12 to find references
        keymap.of([
            {
                key: "Shift-F12",
                run: (view) => findAndHighlightReferences(view, hookName, documentUri),
            },
            {
                key: "Escape",
                run: (view) => {
                    const decs = view.state.field(referencesField);
                    if (decs.size > 0) {
                        clearReferenceHighlights(view);
                        return true;
                    }
                    return false;
                },
            },
        ]),

        // Clear on click elsewhere
        EditorView.domEventHandlers({
            click: (_event, view) => {
                const decs = view.state.field(referencesField);
                if (decs.size > 0) {
                    // Delay to allow the click to set selection first
                    setTimeout(() => clearReferenceHighlights(view), 0);
                }
                return false;
            },
        }),
    ];
}
