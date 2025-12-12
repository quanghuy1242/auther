// =============================================================================
// SIGNATURE TOOLTIP
// =============================================================================
// CodeMirror signature help extension using the LSP-style getSignatureHelp handler

import { EditorView, showTooltip, type Tooltip, keymap } from "@codemirror/view";
import { StateField, StateEffect, type Extension, type EditorState } from "@codemirror/state";

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getSignatureHelp } from "../handlers/signature-help";
import type { SignatureHelp, SignatureInformation } from "../protocol";

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

/**
 * Effect to show or dismiss signature help
 */
const setSignatureHelp = StateEffect.define<SignatureHelp | null>();
const dismissSignatureHelp = StateEffect.define<void>();

/**
 * State field to track signature help state
 */
export const signatureHelpField = StateField.define<{
    help: SignatureHelp | null;
    dismissed: boolean;
    lastCallRange: { from: number; to: number } | null;
}>({
    create: () => ({ help: null, dismissed: false, lastCallRange: null }),
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setSignatureHelp)) {
                return { help: e.value, dismissed: false, lastCallRange: value.lastCallRange };
            }
            if (e.is(dismissSignatureHelp)) {
                return { help: null, dismissed: true, lastCallRange: value.lastCallRange };
            }
        }

        // Clear dismissed state on cursor move outside call
        if (tr.docChanged || tr.selection) {
            return { ...value, dismissed: false };
        }

        return value;
    },
    provide: (f) =>
        showTooltip.computeN([f], (state) => {
            const { help } = state.field(f);
            if (!help || help.signatures.length === 0) return [];

            const tooltip = createSignatureTooltip(state, help);
            return tooltip ? [tooltip] : [];
        }),
});

// =============================================================================
// OPTIONS
// =============================================================================

export interface SignatureHelpOptions {
    /** Current hook name for context-aware signature help */
    hookName?: string;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// TOOLTIP CREATION
// =============================================================================

/**
 * Create a tooltip for signature help
 */
function createSignatureTooltip(state: EditorState, help: SignatureHelp): Tooltip | null {
    const pos = state.selection.main.head;

    return {
        pos,
        above: true,
        strictSide: true,
        arrow: true,
        create: () => {
            const dom = window.document.createElement("div");
            dom.className = "cm-tooltip-signature-help";

            renderSignatureHelp(dom, help);

            return { dom };
        },
    };
}

/**
 * Render signature help content
 */
function renderSignatureHelp(container: HTMLElement, help: SignatureHelp): void {
    const activeIdx = help.activeSignature ?? 0;
    const sig = help.signatures[activeIdx];

    if (!sig) return;

    // Signature label with active parameter highlighted
    const labelDiv = window.document.createElement("div");
    labelDiv.className = "signature-label";
    labelDiv.innerHTML = formatSignatureLabel(sig, help.activeParameter ?? 0);
    container.appendChild(labelDiv);

    // Parameter documentation
    const activeParamIdx = sig.activeParameter ?? help.activeParameter ?? 0;
    const activeParam = sig.parameters?.[activeParamIdx];

    if (activeParam?.documentation) {
        const paramDoc = window.document.createElement("div");
        paramDoc.className = "signature-doc param-doc";
        paramDoc.innerHTML = formatDocumentation(activeParam.documentation);
        container.appendChild(paramDoc);
    }

    // Signature documentation
    if (sig.documentation) {
        const sigDoc = window.document.createElement("div");
        sigDoc.className = "signature-doc";
        sigDoc.innerHTML = formatDocumentation(sig.documentation);
        container.appendChild(sigDoc);
    }
}

/**
 * Format signature label with highlighted active parameter
 */
function formatSignatureLabel(sig: SignatureInformation, activeParam: number): string {
    const label = sig.label;

    if (!sig.parameters || sig.parameters.length === 0) {
        return `<code>${escapeHtml(label)}</code>`;
    }

    // Try to highlight the active parameter in the label
    const params = sig.parameters;
    const parts: string[] = [];

    // Find parameter labels in the signature
    let lastEnd = 0;
    for (let i = 0; i < params.length; i++) {
        const param = params[i];
        let paramLabel: string;
        let start: number;
        let end: number;

        if (typeof param.label === "string") {
            // Search for param in signature
            const idx = label.indexOf(param.label, lastEnd);
            if (idx >= 0) {
                start = idx;
                end = idx + param.label.length;
                paramLabel = param.label;
            } else {
                continue;
            }
        } else {
            [start, end] = param.label;
            paramLabel = label.slice(start, end);
        }

        // Add text before this parameter
        if (start > lastEnd) {
            parts.push(escapeHtml(label.slice(lastEnd, start)));
        }

        // Add parameter (highlighted if active)
        if (i === activeParam) {
            parts.push(`<span class="active-param">${escapeHtml(paramLabel)}</span>`);
        } else {
            parts.push(escapeHtml(paramLabel));
        }

        lastEnd = end;
    }

    // Add remaining text
    if (lastEnd < label.length) {
        parts.push(escapeHtml(label.slice(lastEnd)));
    }

    return `<code>${parts.join("")}</code>`;
}

/**
 * Format documentation content
 */
function formatDocumentation(doc: string | { kind: string; value: string }): string {
    const text = typeof doc === "string" ? doc : doc.value;
    return text
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// =============================================================================
// SIGNATURE HELP LOGIC
// =============================================================================

/**
 * Update signature help for the current cursor position
 */
function updateSignatureHelp(view: EditorView, hookName?: string, documentUri = "file://untitled"): void {
    const code = view.state.doc.toString();
    const pos = view.state.selection.main.head;

    const luaDoc = new LuaDocument(documentUri, code);
    const analysisResult = analyzeDocument(luaDoc, { hookName });
    const position = luaDoc.offsetToPosition(pos);

    const help = getSignatureHelp(luaDoc, analysisResult, position, { hookName });

    view.dispatch({
        effects: setSignatureHelp.of(help),
    });
}

/**
 * Close signature help
 */
export function closeSignatureHelp(view: EditorView): boolean {
    view.dispatch({
        effects: dismissSignatureHelp.of(),
    });
    return true;
}

// =============================================================================
// EXTENSION FACTORY
// =============================================================================

/**
 * Create the signature help extension
 */
export function createSignatureHelp(options: SignatureHelpOptions = {}): Extension {
    const { hookName, documentUri } = options;

    return [
        signatureHelpField,

        // Trigger on typing ( or ,
        EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;

            const pos = update.state.selection.main.head;
            const lastChar = pos > 0 ? update.state.doc.sliceString(pos - 1, pos) : "";

            // Trigger on ( or ,
            if (lastChar === "(" || lastChar === ",") {
                updateSignatureHelp(update.view, hookName, documentUri);
            }
            // Dismiss on )
            else if (lastChar === ")") {
                closeSignatureHelp(update.view);
            }
            // Update on other changes
            else {
                const state = update.state.field(signatureHelpField);
                if (state.help) {
                    updateSignatureHelp(update.view, hookName, documentUri);
                }
            }
        }),

        // Keymap for Escape to close
        keymap.of([
            {
                key: "Escape",
                run: (view) => {
                    const state = view.state.field(signatureHelpField);
                    if (state.help) {
                        return closeSignatureHelp(view);
                    }
                    return false;
                },
            },
        ]),
    ];
}
