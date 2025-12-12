// =============================================================================
// HOVER TOOLTIP
// =============================================================================
// CodeMirror hover extension that uses the LSP-style getHover handler

import { hoverTooltip, type Tooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getHover } from "../handlers/hover";
import { MarkupKind } from "../protocol";

// =============================================================================
// OPTIONS
// =============================================================================

export interface HoverTooltipOptions {
    /** Current hook name for context-aware hover */
    hookName?: string;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// HOVER TOOLTIP EXTENSION
// =============================================================================

/**
 * Create a CodeMirror hover tooltip extension using the LSP-style handler
 */
export function createHoverTooltip(options: HoverTooltipOptions = {}): Extension {
    const { hookName, documentUri = "file://untitled" } = options;

    return hoverTooltip((view, pos) => {
        const code = view.state.doc.toString();

        // Create document and analyze
        const luaDoc = new LuaDocument(documentUri, code);
        const analysisResult = analyzeDocument(luaDoc, { hookName });

        // Get LSP-style position
        const position = luaDoc.offsetToPosition(pos);

        // Get hover from handler
        const hover = getHover(luaDoc, analysisResult, position, { hookName });

        if (!hover) {
            return null;
        }

        // Get the hover range
        const from = hover.range
            ? luaDoc.positionToOffset(hover.range.start)
            : pos;
        const to = hover.range
            ? luaDoc.positionToOffset(hover.range.end)
            : pos;

        const tooltip: Tooltip = {
            pos: from,
            end: to,
            above: true,
            create: () => {
                const dom = window.document.createElement("div");
                dom.className = "cm-tooltip-lua-hover";

                // Convert markup content to HTML
                if (typeof hover.contents === "string") {
                    dom.textContent = hover.contents;
                } else if (Array.isArray(hover.contents)) {
                    // Array of MarkedString or MarkupContent
                    const html = hover.contents
                        .map((c) => (typeof c === "string" ? c : c.value))
                        .join("\n\n");
                    dom.innerHTML = markdownToHtml(html);
                } else {
                    // MarkupContent
                    const content = hover.contents;
                    if (content.kind === MarkupKind.Markdown) {
                        dom.innerHTML = markdownToHtml(content.value);
                    } else {
                        dom.textContent = content.value;
                    }
                }

                return { dom };
            },
        };

        return tooltip;
    }, {
        hideOnChange: true,
        hoverTime: 300,
    });
}

// =============================================================================
// MARKDOWN CONVERSION
// =============================================================================

/**
 * Simple markdown to HTML conversion for hover content
 */
function markdownToHtml(markdown: string): string {
    return markdown
        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) =>
            `<pre style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; overflow-x: auto;"><code>${escapeHtml(code.trim())}</code></pre>`)
        // Inline code
        .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.2); padding: 1px 4px; border-radius: 3px;">$1</code>')
        // Bold
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        // Italic
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        // Headers
        .replace(/^### (.+)$/gm, '<h4 style="margin: 8px 0 4px;">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="margin: 8px 0 4px;">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 style="margin: 8px 0 4px;">$1</h2>')
        // Line breaks
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
