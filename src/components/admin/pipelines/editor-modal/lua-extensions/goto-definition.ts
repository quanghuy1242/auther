// =============================================================================
// GO TO DEFINITION
// =============================================================================
// Ctrl+Click to jump to local variable declaration

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import * as luaparse from "luaparse";
import type { Chunk, LocalStatement, FunctionDeclaration, Identifier } from "luaparse";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface DefinitionLocation {
    name: string;
    line: number;
    column: number;
    offset: number;
}

// =============================================================================
// AST WALKER
// =============================================================================

interface LuaNode {
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

function walkAST(node: LuaNode, callback: (node: LuaNode) => void): void {
    if (!node || typeof node !== "object") return;
    callback(node);
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) {
                if (child && typeof child === "object") {
                    walkAST(child, callback);
                }
            }
        } else if (value && typeof value === "object" && value.type) {
            walkAST(value, callback);
        }
    }
}

// =============================================================================
// FIND DEFINITIONS
// =============================================================================

/**
 * Extract all local variable and function definitions from Lua code
 */
export function findDefinitions(code: string): Map<string, DefinitionLocation> {
    const definitions = new Map<string, DefinitionLocation>();

    try {
        const ast = luaparse.parse(code, {
            locations: true,
            ranges: true,
            scope: true,
            comments: false,
            luaVersion: "5.3",
        }) as Chunk;

        walkAST(ast, (node: LuaNode) => {
            // Local statement: local x = expr
            if (node.type === "LocalStatement") {
                const stmt = node as unknown as LocalStatement;
                for (const varNode of stmt.variables || []) {
                    if (varNode.type === "Identifier") {
                        const id = varNode as Identifier;
                        definitions.set(id.name, {
                            name: id.name,
                            line: id.loc?.start?.line || 1,
                            column: id.loc?.start?.column || 0,
                            offset: id.range?.[0] || 0,
                        });
                    }
                }
            }

            // Function declaration: local function foo()
            if (node.type === "FunctionDeclaration") {
                const fn = node as unknown as FunctionDeclaration;
                if (fn.identifier?.type === "Identifier") {
                    const id = fn.identifier as Identifier;
                    definitions.set(id.name, {
                        name: id.name,
                        line: id.loc?.start?.line || 1,
                        column: id.loc?.start?.column || 0,
                        offset: id.range?.[0] || 0,
                    });
                }
            }

            // For statement iterator: for i = 1, 10 do
            if (node.type === "ForNumericStatement") {
                const varNode = node.variable;
                if (varNode?.type === "Identifier") {
                    definitions.set(varNode.name, {
                        name: varNode.name,
                        line: varNode.loc?.start?.line || 1,
                        column: varNode.loc?.start?.column || 0,
                        offset: varNode.range?.[0] || 0,
                    });
                }
            }

            // For-in statement: for k, v in pairs(t) do
            if (node.type === "ForGenericStatement") {
                for (const varNode of node.variables || []) {
                    if (varNode?.type === "Identifier") {
                        definitions.set(varNode.name, {
                            name: varNode.name,
                            line: varNode.loc?.start?.line || 1,
                            column: varNode.loc?.start?.column || 0,
                            offset: varNode.range?.[0] || 0,
                        });
                    }
                }
            }
        });
    } catch {
        // Parsing failed, return empty map
    }

    return definitions;
}

// =============================================================================
// GET WORD AT POSITION
// =============================================================================

/**
 * Get the word (identifier) at a given position in the document
 */
function getWordAtPos(view: EditorView, pos: number): { word: string; from: number; to: number } | null {
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const lineOffset = pos - line.from;

    // Find word boundaries
    let start = lineOffset;
    let end = lineOffset;

    // Move start backwards
    while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1])) {
        start--;
    }

    // Move end forwards
    while (end < lineText.length && /[a-zA-Z0-9_]/.test(lineText[end])) {
        end++;
    }

    if (start === end) return null;

    const word = lineText.slice(start, end);
    return {
        word,
        from: line.from + start,
        to: line.from + end,
    };
}

// =============================================================================
// GO TO DEFINITION EXTENSION
// =============================================================================

/**
 * Jump to the definition of a local variable or function.
 * Triggered by Ctrl+Click (Cmd+Click on Mac).
 */
export function luaGotoDefinition(): Extension {
    return EditorView.domEventHandlers({
        click(event: MouseEvent, view: EditorView) {
            // Check for Ctrl+Click (or Cmd+Click on Mac)
            if (!event.ctrlKey && !event.metaKey) return false;

            // Get position in document
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;

            // Get word at click position
            const wordInfo = getWordAtPos(view, pos);
            if (!wordInfo) return false;

            // Don't try to jump to keywords
            const keywords = ["local", "function", "if", "then", "else", "elseif", "end",
                "for", "do", "while", "repeat", "until", "return", "break",
                "and", "or", "not", "in", "nil", "true", "false"];
            if (keywords.includes(wordInfo.word)) return false;

            // Find definitions in current code
            const code = view.state.doc.toString();
            const definitions = findDefinitions(code);

            // Look up the word
            const def = definitions.get(wordInfo.word);
            if (!def) return false;

            // Don't jump if already at definition
            const clickLine = view.state.doc.lineAt(pos).number;
            if (clickLine === def.line) return false;

            // Jump to definition
            const targetLine = view.state.doc.line(def.line);
            const targetPos = targetLine.from + def.column;

            view.dispatch({
                selection: { anchor: targetPos },
                scrollIntoView: true,
            });

            // Prevent default click behavior
            event.preventDefault();
            return true;
        },
    });
}
