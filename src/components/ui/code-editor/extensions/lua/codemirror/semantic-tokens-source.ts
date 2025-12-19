
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getSemanticTokens, TOKEN_TYPES } from "../handlers/semantic-tokens";

// =============================================================================
// DECORATIONS
// =============================================================================

// Create decorations for each token type
const tokenDecorations = new Map<string, Decoration>();

TOKEN_TYPES.forEach((type) => {
    // Convert camelCase to kebab-case for CSS class
    // e.g. "typeParameter" -> "type-parameter"
    const className = type.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

    tokenDecorations.set(
        type,
        Decoration.mark({ class: `cm-semantic-${className}` })
    );
});

// Map legacy/LSP types to simpler classes if needed, but strict mapping is fine.
// We will generate CSS for .cm-semantic-variable, .cm-semantic-function, etc.

// =============================================================================
// PLUGIN
// =============================================================================

export interface SemanticTokensOptions {
    /** Hook name for context-aware analysis */
    hookName?: string;
}

export function createSemanticTokens(options: SemanticTokensOptions = {}) {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.computeDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.computeDecorations(update.view);
                }
            }

            computeDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();

                // Analyze document
                const docText = view.state.doc.toString();
                const document = new LuaDocument("file://untitled", docText);
                const analysisResult = analyzeDocument(document, {
                    hookName: options.hookName
                });

                // Get semantic tokens
                const semanticTokens = getSemanticTokens(document, analysisResult);

                // Apply decorations
                // Note: SemanticTokens are delta-encoded [deltaLine, deltaChar, length, type, modifiers]
                // We need to decode them to absolute positions.

                const data = semanticTokens.data;
                let currentLine = 0;
                let currentChar = 0;

                for (let i = 0; i < data.length; i += 5) {
                    const deltaLine = data[i];
                    const deltaChar = data[i + 1];
                    const length = data[i + 2];
                    const typeIdx = data[i + 3];
                    // const modifiers = data[i + 4]; // Modifiers use bitmask, can add extra classes if needed

                    currentLine += deltaLine;
                    if (deltaLine > 0) {
                        currentChar = deltaChar;
                    } else {
                        currentChar += deltaChar;
                    }

                    const tokenType = TOKEN_TYPES[typeIdx];
                    const decoration = tokenDecorations.get(tokenType);

                    if (decoration) {
                        // Convert line/char to offset
                        try {
                            const lineObj = view.state.doc.line(currentLine + 1); // CodeMirror lines are 1-based
                            const startOffset = lineObj.from + currentChar;
                            const endOffset = startOffset + length;

                            if (endOffset <= view.state.doc.length) {
                                builder.add(startOffset, endOffset, decoration);
                            }
                        } catch (_e) {
                            // Ignore range errors during edits
                        }
                    }
                }

                return builder.finish();
            }
        },
        {
            decorations: (v) => v.decorations,
        }
    );
}
