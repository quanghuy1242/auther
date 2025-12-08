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
function findAllOccurrences(
    text: string,
    word: string
): Array<{ from: number; to: number }> {
    const occurrences: Array<{ from: number; to: number }> = [];
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "g");

    let match;
    while ((match = regex.exec(text)) !== null) {
        occurrences.push({
            from: match.index,
            to: match.index + word.length,
        });
    }

    return occurrences;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/**
 * Find and highlight all references to the word under cursor.
 * Returns true if references were found, false otherwise.
 */
function findReferences(view: EditorView): boolean {
    const word = getWordAtCursor(view);
    if (!word) {
        // Clear any existing highlights
        view.dispatch({
            effects: clearReferenceHighlights.of(null),
        });
        return false;
    }

    // Don't highlight keywords
    const keywords = [
        "local", "function", "if", "then", "else", "elseif", "end",
        "for", "do", "while", "repeat", "until", "return", "break",
        "and", "or", "not", "in", "nil", "true", "false",
    ];
    if (keywords.includes(word)) return false;

    // Find all occurrences
    const text = view.state.doc.toString();
    const occurrences = findAllOccurrences(text, word);

    if (occurrences.length === 0) return false;

    // Create decorations
    const decorations = Decoration.set(
        occurrences.map((occ) => referenceMark.range(occ.from, occ.to))
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
export { findReferences, clearReferences, findAllOccurrences };
