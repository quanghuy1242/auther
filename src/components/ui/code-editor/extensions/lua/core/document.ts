// =============================================================================
// LUA DOCUMENT
// =============================================================================
// Document abstraction for text and AST management
// Inspired by EmmyLua's LuaDocument and Vfs

import * as luaparse from "luaparse";
import type { Range, Position } from "../protocol";
import { createRangeFromCoords, createRange } from "../protocol";
import type { LuaChunk, LuaComment } from "./luaparse-types";
import { asLuaChunk, LuaNode } from "./luaparse-types";

// =============================================================================
// NODE UTILITIES
// =============================================================================

/**
 * Get the range of a node in the document
 */
export function getNodeRange(document: LuaDocument, node: LuaNode): Range {
    if (node.loc) {
        return document.locToRange(node.loc);
    }
    if (node.range) {
        return document.offsetRangeToRange(node.range[0], node.range[1]);
    }
    return createRange({ line: 0, character: 0 }, { line: 0, character: 0 });
}

// =============================================================================
// PARSE ERROR
// =============================================================================

/**
 * Parse error from luaparse
 */
export interface LuaParseError {
    message: string;
    index: number;
    line: number;
    column: number;
    range: Range;
}

// =============================================================================
// LINE INFO
// =============================================================================

/**
 * Line offset information for efficient position <-> offset conversion
 */
interface LineInfo {
    /** Starting offset of each line (0-indexed) */
    lineStarts: number[];
    /** Total number of lines */
    lineCount: number;
}

function computeLineInfo(text: string): LineInfo {
    const lineStarts: number[] = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n") {
            lineStarts.push(i + 1);
        }
    }
    return {
        lineStarts,
        lineCount: lineStarts.length,
    };
}

// =============================================================================
// LUA DOCUMENT
// =============================================================================

/**
 * Represents a Lua source document with text, AST, and position utilities.
 * Similar to EmmyLua's LuaDocument.
 */
export class LuaDocument {
    readonly uri: string;
    readonly version: number;

    private _text: string;
    private _lineInfo: LineInfo;
    private _ast: LuaChunk | null = null;
    private _parseError: LuaParseError | null = null;
    private _comments: LuaComment[] = [];
    private _parsed = false;

    constructor(uri: string, text: string, version = 0) {
        this.uri = uri;
        this.version = version;
        this._text = text;
        this._lineInfo = computeLineInfo(text);
    }

    // ---------------------------------------------------------------------------
    // Text Access
    // ---------------------------------------------------------------------------

    /**
     * Get the full document text
     */
    getText(): string {
        return this._text;
    }

    /**
     * Get a substring of the document
     */
    getTextRange(start: number, end: number): string {
        return this._text.slice(start, end);
    }

    /**
     * Get text for a given Range
     */
    getTextInRange(range: Range): string {
        const startOffset = this.positionToOffset(range.start);
        const endOffset = this.positionToOffset(range.end);
        return this._text.slice(startOffset, endOffset);
    }

    /**
     * Get a specific line (0-indexed)
     */
    getLine(line: number): string {
        if (line < 0 || line >= this._lineInfo.lineCount) {
            return "";
        }
        const start = this._lineInfo.lineStarts[line];
        const end =
            line + 1 < this._lineInfo.lineCount
                ? this._lineInfo.lineStarts[line + 1] - 1
                : this._text.length;
        return this._text.slice(start, end);
    }

    /**
     * Get all lines
     */
    getLines(): string[] {
        const lines: string[] = [];
        for (let i = 0; i < this._lineInfo.lineCount; i++) {
            lines.push(this.getLine(i));
        }
        return lines;
    }

    /**
     * Get the number of lines
     */
    getLineCount(): number {
        return this._lineInfo.lineCount;
    }

    /**
     * Get the document length in characters
     */
    getLength(): number {
        return this._text.length;
    }

    /**
     * Get the word at a specific position
     */
    getWordAtPosition(pos: Position): string {
        const line = this.getLine(pos.line);
        if (!line) return "";

        const wordPattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        let match;
        while ((match = wordPattern.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (pos.character >= start && pos.character <= end) {
                return match[0];
            }
        }
        return "";
    }

    // ---------------------------------------------------------------------------
    // Position Conversion
    // ---------------------------------------------------------------------------

    /**
     * Convert Position (line, character) to offset
     */
    positionToOffset(pos: Position): number {
        const { line, character } = pos;
        if (line < 0 || line >= this._lineInfo.lineCount) {
            return line < 0 ? 0 : this._text.length;
        }
        const lineStart = this._lineInfo.lineStarts[line];
        const lineEnd =
            line + 1 < this._lineInfo.lineCount
                ? this._lineInfo.lineStarts[line + 1]
                : this._text.length;
        const maxChar = lineEnd - lineStart;
        return lineStart + Math.min(character, maxChar);
    }

    /**
     * Convert offset to Position (line, character)
     */
    offsetToPosition(offset: number): Position {
        if (offset < 0) {
            return { line: 0, character: 0 };
        }
        if (offset >= this._text.length) {
            const lastLine = this._lineInfo.lineCount - 1;
            const lineStart = this._lineInfo.lineStarts[lastLine];
            return { line: lastLine, character: this._text.length - lineStart };
        }

        // Binary search for the line
        let low = 0;
        let high = this._lineInfo.lineCount - 1;
        while (low < high) {
            const mid = Math.floor((low + high + 1) / 2);
            if (this._lineInfo.lineStarts[mid] <= offset) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }

        const line = low;
        const character = offset - this._lineInfo.lineStarts[line];
        return { line, character };
    }

    /**
     * Convert [start, end] offset range to Range
     */
    offsetRangeToRange(start: number, end: number): Range {
        return {
            start: this.offsetToPosition(start),
            end: this.offsetToPosition(end),
        };
    }

    /**
     * Convert luaparse loc to Range
     */
    locToRange(loc: { start: { line: number; column: number }; end: { line: number; column: number } }): Range {
        // luaparse uses 1-indexed lines, we use 0-indexed
        return createRangeFromCoords(
            loc.start.line - 1,
            loc.start.column,
            loc.end.line - 1,
            loc.end.column
        );
    }

    // ---------------------------------------------------------------------------
    // AST Access
    // ---------------------------------------------------------------------------

    /**
     * Ensure the document is parsed
     */
    private ensureParsed(): void {
        if (this._parsed) return;
        this._parsed = true;

        const comments: LuaComment[] = [];

        try {
            const ast = luaparse.parse(this._text, {
                locations: true,
                ranges: true,
                scope: true,
                comments: true,
                luaVersion: "5.3",
                onCreateNode: (node) => {
                    // Collect comments - luaparse provides Comment type in callback
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if ((node as any).type === "Comment") {
                        comments.push(node as unknown as LuaComment);
                    }
                },
            });

            this._ast = asLuaChunk(ast);
            this._comments = comments;
            this._parseError = null;
        } catch (e: unknown) {
            const error = e as {
                index?: number;
                line?: number;
                column?: number;
                message?: string;
            };

            const index = error.index ?? 0;
            const line = (error.line ?? 1) - 1; // Convert to 0-indexed
            const column = error.column ?? 0;

            // Clean up error message (remove position info that luaparse adds)
            let message = error.message || "Syntax error";
            message = message.replace(/\s*\[\d+:\d+\]\s*$/, "").trim();

            this._parseError = {
                message,
                index,
                line,
                column,
                range: createRangeFromCoords(line, column, line, column + 1),
            };

            // [Recovery Strategy]
            // If parsing failed, try to recover by replacing the problematic line with spaces.
            // This allows us to generate a partial AST and SymbolTable for the valid parts of the code.
            try {
                const lineStart = this._lineInfo.lineStarts[line];
                const nextLineStart = line + 1 < this._lineInfo.lineCount
                    ? this._lineInfo.lineStarts[line + 1]
                    : this._text.length;

                // Replace error line content with spaces (preserve newlines/length for offsets)
                // const lineLength = nextLineStart - lineStart;
                // const charCode = this._text.charCodeAt(nextLineStart - 1);
                // const hasCR = charCode === 13; // \r
                // const hasLF = charCode === 10; // \n (previous char if CRLF?) -> Simplify: just look at slice

                // Simpler: substring to line, replace with spaces, keep newline
                const before = this._text.substring(0, lineStart);
                const after = this._text.substring(nextLineStart);
                const lineContent = this._text.substring(lineStart, nextLineStart);

                // Preserve just newlines
                const sanitizedLine = lineContent.replace(/[^\r\n]/g, " ");

                const recoveredText = before + sanitizedLine + after;

                const recoveredAst = luaparse.parse(recoveredText, {
                    locations: true,
                    ranges: true,
                    scope: true,
                    comments: true,
                    luaVersion: "5.3",
                    onCreateNode: (node) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        if ((node as any).type === "Comment") {
                            comments.push(node as unknown as LuaComment);
                        }
                    },
                });

                this._ast = asLuaChunk(recoveredAst);
                this._comments = comments;
                // We keep _parseError set so the editor knows there's an error, 
                // but we populate _ast so intelligence works.
            } catch (_recoveryError) {
                this._ast = null;
            }
        }
    }

    /**
     * Get the parsed AST (null if parse error)
     */
    getAST(): LuaChunk | null {
        this.ensureParsed();
        return this._ast;
    }

    /**
     * Get parse error (null if successful)
     */
    getParseError(): LuaParseError | null {
        this.ensureParsed();
        return this._parseError;
    }

    /**
     * Check if document has syntax errors
     */
    hasSyntaxError(): boolean {
        this.ensureParsed();
        return this._parseError !== null;
    }

    /**
     * Get collected comments
     */
    getComments(): LuaComment[] {
        this.ensureParsed();
        return this._comments;
    }

    // ---------------------------------------------------------------------------
    // Document Updates
    // ---------------------------------------------------------------------------

    /**
     * Create a new document with updated text (immutable update)
     */
    update(newText: string): LuaDocument {
        return new LuaDocument(this.uri, newText, this.version + 1);
    }

    /**
     * Apply incremental text changes and return new document
     */
    applyChanges(
        changes: Array<{ range?: Range; text: string }>
    ): LuaDocument {
        let newText = this._text;

        // Apply changes in reverse order to maintain correct offsets
        const sortedChanges = [...changes].sort((a, b) => {
            if (!a.range || !b.range) return 0;
            const aStart = this.positionToOffset(a.range.start);
            const bStart = this.positionToOffset(b.range.start);
            return bStart - aStart; // Reverse order
        });

        for (const change of sortedChanges) {
            if (change.range) {
                const start = this.positionToOffset(change.range.start);
                const end = this.positionToOffset(change.range.end);
                newText = newText.slice(0, start) + change.text + newText.slice(end);
            } else {
                // Full document replacement
                newText = change.text;
            }
        }

        return new LuaDocument(this.uri, newText, this.version + 1);
    }

    // ---------------------------------------------------------------------------
    // Static Helpers
    // ---------------------------------------------------------------------------

    /**
     * Create a document from text content
     */
    static create(uri: string, text: string, version = 0): LuaDocument {
        return new LuaDocument(uri, text, version);
    }
}
