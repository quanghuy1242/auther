// =============================================================================
// DOCUMENT OUTLINE
// =============================================================================
// Provides document outline (symbol list) for the editor using getDocumentSymbols

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getDocumentSymbols } from "../handlers/document-symbols";
import type { DocumentSymbol } from "../protocol";
import { SymbolKind } from "../protocol";

// =============================================================================
// OPTIONS
// =============================================================================

export interface DocumentOutlineOptions {
    /** Current hook name for context */
    hookName?: string;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// OUTLINE TYPES
// =============================================================================

/**
 * Outline item for display
 */
export interface OutlineItem {
    /** Display label */
    label: string;
    /** Symbol kind icon/type */
    kind: string;
    /** Detail text (e.g., function params) */
    detail?: string;
    /** Start offset in document */
    from: number;
    /** End offset in document */
    to: number;
    /** Indentation level */
    level: number;
    /** Child items */
    children?: OutlineItem[];
}

// =============================================================================
// KIND MAPPING
// =============================================================================

/**
 * Map SymbolKind to display string
 */
function kindToString(kind: SymbolKind): string {
    switch (kind) {
        case SymbolKind.Function:
        case SymbolKind.Method:
            return "function";
        case SymbolKind.Variable:
            return "variable";
        case SymbolKind.Field:
        case SymbolKind.Property:
            return "property";
        case SymbolKind.Class:
            return "class";
        case SymbolKind.Module:
            return "module";
        case SymbolKind.Constant:
            return "constant";
        default:
            return "symbol";
    }
}

/**
 * Get icon for symbol kind
 */
function kindToIcon(kind: SymbolKind): string {
    switch (kind) {
        case SymbolKind.Function:
        case SymbolKind.Method:
            return "ƒ";
        case SymbolKind.Variable:
            return "𝑥";
        case SymbolKind.Field:
        case SymbolKind.Property:
            return "◇";
        case SymbolKind.Class:
            return "■";
        case SymbolKind.Module:
            return "◆";
        case SymbolKind.Constant:
            return "●";
        default:
            return "○";
    }
}

// =============================================================================
// OUTLINE FACTORY
// =============================================================================

/**
 * Create document outline from code
 */
export function createDocumentOutline(
    code: string,
    options: DocumentOutlineOptions = {}
): OutlineItem[] {
    const { hookName, documentUri = "file://untitled" } = options;

    // Create document and analyze
    const luaDoc = new LuaDocument(documentUri, code);
    const analysisResult = analyzeDocument(luaDoc, { hookName });

    // Get document symbols
    const symbols = getDocumentSymbols(luaDoc, analysisResult);

    // Convert to outline items
    return convertToOutlineItems(symbols, luaDoc, 0);
}

/**
 * Convert DocumentSymbol array to OutlineItem array
 */
function convertToOutlineItems(
    symbols: DocumentSymbol[],
    luaDoc: LuaDocument,
    level: number
): OutlineItem[] {
    return symbols.map((sym) => {
        const from = luaDoc.positionToOffset(sym.range.start);
        const to = luaDoc.positionToOffset(sym.range.end);

        const item: OutlineItem = {
            label: sym.name,
            kind: kindToString(sym.kind),
            detail: sym.detail,
            from,
            to,
            level,
        };

        if (sym.children && sym.children.length > 0) {
            item.children = convertToOutlineItems(sym.children, luaDoc, level + 1);
        }

        return item;
    });
}

/**
 * Get a flat list of outline items for simple display
 */
export function getFlatOutline(
    code: string,
    options: DocumentOutlineOptions = {}
): OutlineItem[] {
    const hierarchical = createDocumentOutline(code, options);
    const flat: OutlineItem[] = [];

    const flatten = (items: OutlineItem[], level: number) => {
        for (const item of items) {
            flat.push({ ...item, level });
            if (item.children) {
                flatten(item.children, level + 1);
            }
        }
    };

    flatten(hierarchical, 0);
    return flat;
}

/**
 * Render outline to HTML (for sidebar display)
 */
export function renderOutlineHtml(items: OutlineItem[]): string {
    const renderItem = (item: OutlineItem): string => {
        const indent = "  ".repeat(item.level);
        const icon = kindToIcon(item.kind as unknown as SymbolKind);
        const detail = item.detail ? ` <span class="detail">${item.detail}</span>` : "";

        let html = `${indent}<div class="outline-item" data-from="${item.from}" data-to="${item.to}">
            <span class="icon">${icon}</span>
            <span class="label">${item.label}</span>${detail}
        </div>\n`;

        if (item.children) {
            html += item.children.map(renderItem).join("");
        }

        return html;
    };

    return items.map(renderItem).join("");
}
