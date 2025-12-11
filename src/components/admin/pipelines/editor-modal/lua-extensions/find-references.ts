// =============================================================================
// FIND REFERENCES
// =============================================================================
// Shift+F12 to find all references to a variable

import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

// Effect to set reference highlights
const setReferenceHighlights = StateEffect.define<{ decorations: DecorationSet }>();

// Effect to clear highlights
const clearReferenceHighlights = StateEffect.define<null>();

// Decoration mark for highlighting references
const referenceMark = Decoration.mark({ class: "cm-reference-highlight" });

// State field to track reference highlights
const referenceHighlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setReferenceHighlights)) {
                return effect.value.decorations;
            }
            if (effect.is(clearReferenceHighlights)) {
                return Decoration.none;
            }
        }
        // Keep decorations across edits, but may become stale
        return decorations.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
});

// =============================================================================
// FIND ALL OCCURRENCES
// =============================================================================

/**
 * Find all occurrences of a word in the document
 */
// (Removed regex-based helpers)

// =============================================================================
// GET WORD AT CURSOR
// =============================================================================

function getWordAtCursor(view: EditorView): string | null {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const lineOffset = pos - line.from;

    // Find word boundaries
    let start = lineOffset;
    let end = lineOffset;

    while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1])) {
        start--;
    }

    while (end < lineText.length && /[a-zA-Z0-9_]/.test(lineText[end])) {
        end++;
    }

    if (start === end) return null;

    return lineText.slice(start, end);
}

// =============================================================================
// FIND REFERENCES COMMAND
// =============================================================================

// -----------------------------------------------------------------------------
// HELPER: Find Definitions / References
// -----------------------------------------------------------------------------

import { inferVariableTypes, findNodePathAtPosition, type LuaNode } from "./type-inference";

function findReferencesInCode(
    code: string,
    pos: number
): Array<{ from: number; to: number }> {
    const { ast } = inferVariableTypes(code);
    if (!ast) return [];

    const path = findNodePathAtPosition(ast as LuaNode, pos);
    if (path.length === 0) return [];

    const node = path[path.length - 1];
    if (node.type !== "Identifier") return [];

    // The node should have a scope attached (from type-inference traverse)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scope = (node as any).scope;
    if (!scope) {
        // Fallback: If no scope attached (shouldn't happen if traverse ran),
        // we can't accurately find references.
        return [];
    }

    // Look up variable in the scope
    // Use the name from the identifier
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variable = scope.get((node as any).name);

    if (!variable) return [];

    // Collect ranges from declarations (?) and references
    const ranges: Array<{ from: number; to: number }> = [];

    // Add references
    if (variable.references) {
        variable.references.forEach((ref: LuaNode) => {
            if (ref.range) {
                ranges.push({ from: ref.range[0], to: ref.range[1] });
            }
        });
    }

    // Add initNode if it is the identifier itself (sometimes initNode is the value)
    // Actually VariableType.references should include the declaration identifier if we implemented it right
    // We did init references=[nameIdentifier] for functions.
    // For locals, we rely on generic handler.
    // So references array should be complete.

    return ranges;
}

/**
 * Find and highlight all references to the word under cursor.
 * Returns true if references were found, false otherwise.
 */
function findReferences(view: EditorView): boolean {
    const pos = view.state.selection.main.head;
    const code = view.state.doc.toString();

    // Quick check if we are on a word
    const word = getWordAtCursor(view);
    if (!word) {
        view.dispatch({ effects: clearReferenceHighlights.of(null) });
        return false;
    }

    const ranges = findReferencesInCode(code, pos);

    if (ranges.length === 0) {
        // Fallback or just clear
        view.dispatch({ effects: clearReferenceHighlights.of(null) });
        return false;
    }

    // Create decorations
    const decorations = Decoration.set(
        ranges.sort((a, b) => a.from - b.from).map((r) => referenceMark.range(r.from, r.to))
    );

    // Update state with new decorations
    view.dispatch({
        effects: setReferenceHighlights.of({ decorations }),
    });

    return true;
}

/**
 * Clear all reference highlights
 */
function clearReferences(view: EditorView): boolean {
    view.dispatch({
        effects: clearReferenceHighlights.of(null),
    });
    return true;
}

// =============================================================================
// FIND REFERENCES EXTENSION
// =============================================================================

/**
 * Creates the find references extension.
 * - Shift+F12: Find all references to word under cursor
 * - ESC: Clear highlights (when not in autocomplete)
 */
export function luaFindReferences(): Extension {
    return [
        referenceHighlightField,
        keymap.of([
            {
                key: "Shift-F12",
                run: findReferences,
            },
            {
                key: "Escape",
                run: (view) => {
                    // Only clear if we have highlights
                    const decorations = view.state.field(referenceHighlightField);
                    if (decorations.size > 0) {
                        clearReferences(view);
                        return true;
                    }
                    return false;
                },
            },
        ]),
        // Theme for reference highlights
        EditorView.baseTheme({
            ".cm-reference-highlight": {
                backgroundColor: "rgba(97, 175, 239, 0.3)",
                borderRadius: "2px",
            },
        }),
    ];
}

// Export for advanced usage
export { findReferences, clearReferences, findReferencesInCode };
