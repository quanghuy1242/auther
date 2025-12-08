// =============================================================================
// LUA CODE FORMATTER
// =============================================================================
// Simple Lua code formatter with keyboard shortcut support

import { EditorView, keymap } from "@codemirror/view";
import type { KeyBinding } from "@codemirror/view";

// =============================================================================
// FORMATTING LOGIC
// =============================================================================

/**
 * Format Lua code with consistent indentation and spacing
 */
export function formatLuaCode(code: string): string {
    const lines = code.split("\n");
    const formattedLines: string[] = [];
    let indentLevel = 0;
    const indentStr = "    "; // 4 spaces

    // Keywords that increase indent
    const increaseIndentPatterns = [
        /^\s*function\b.*\)$/,
        /^\s*function\b.*\)\s*$/,
        /^\s*if\b.*\bthen\s*$/,
        /^\s*if\b.*\bthen$/,
        /^\s*else\s*$/,
        /^\s*elseif\b.*\bthen\s*$/,
        /^\s*for\b.*\bdo\s*$/,
        /^\s*while\b.*\bdo\s*$/,
        /^\s*repeat\s*$/,
        /^\s*do\s*$/,
    ];

    // Keywords that decrease indent (before the line)
    const decreaseIndentPatterns = [
        /^\s*end\b/,
        /^\s*else\b/,
        /^\s*elseif\b/,
        /^\s*until\b/,
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines but preserve them
        if (line === "") {
            formattedLines.push("");
            continue;
        }

        // Check if we should decrease indent before this line
        const shouldDecreaseFirst = decreaseIndentPatterns.some((p) => p.test(line));
        if (shouldDecreaseFirst && indentLevel > 0) {
            indentLevel--;
        }

        // Format the line
        const formattedLine = formatLine(line);

        // Add proper indentation
        formattedLines.push(indentStr.repeat(indentLevel) + formattedLine);

        // Check if we should increase indent for next line
        const shouldIncrease = increaseIndentPatterns.some((p) => p.test(line));
        if (shouldIncrease) {
            indentLevel++;
        }
    }

    return formattedLines.join("\n");
}

/**
 * Format a single line of Lua code
 */
function formatLine(line: string): string {
    let result = line;

    // Normalize spaces around operators
    result = result.replace(/\s*([=~<>!]=?)\s*/g, " $1 ");
    result = result.replace(/\s*,\s*/g, ", ");

    // Fix double spaces
    result = result.replace(/  +/g, " ");

    // Fix spaces around parentheses
    result = result.replace(/\(\s+/g, "(");
    result = result.replace(/\s+\)/g, ")");

    // Fix spaces around brackets
    result = result.replace(/\[\s+/g, "[");
    result = result.replace(/\s+\]/g, "]");

    // Fix spaces around braces (but keep content spacing)
    result = result.replace(/{\s+/g, "{ ");
    result = result.replace(/\s+}/g, " }");

    // Single space after keywords
    result = result.replace(/\b(if|elseif|while|for|function|local|return|and|or|not)\s+/g, "$1 ");

    // Trim the result
    result = result.trim();

    return result;
}

// =============================================================================
// CODEMIRROR INTEGRATION
// =============================================================================

/**
 * Command to format the current document
 */
function formatDocument(view: EditorView): boolean {
    const code = view.state.doc.toString();
    const formatted = formatLuaCode(code);

    if (formatted !== code) {
        view.dispatch({
            changes: {
                from: 0,
                to: code.length,
                insert: formatted,
            },
        });
    }

    return true;
}

/**
 * Keybinding for format document (Ctrl+Shift+F)
 */
export const formatKeyBinding: KeyBinding = {
    key: "Ctrl-Shift-f",
    mac: "Cmd-Shift-f",
    run: formatDocument,
    preventDefault: true,
};

/**
 * Extension that adds format document command
 */
export function luaFormatter() {
    return keymap.of([formatKeyBinding]);
}
