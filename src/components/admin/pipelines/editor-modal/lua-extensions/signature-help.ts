// =============================================================================
// LUA FUNCTION SIGNATURE HELP
// =============================================================================
// Shows parameter hints when typing inside function calls

import { EditorView, showTooltip, Tooltip } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import { HELPERS_DEFINITIONS } from "./definitions";

// =============================================================================
// SIGNATURE HELP TOOLTIP
// =============================================================================

interface SignatureInfo {
    name: string;
    signature: string;
    activeParam: number;
    params: Array<{ name: string; type: string; description: string; optional?: boolean }>;
}

function getSignatureAtPosition(code: string, pos: number): SignatureInfo | null {
    // Look backwards to find an open parenthesis
    let depth = 0;
    let paramIndex = 0;
    let funcStart = -1;

    for (let i = pos - 1; i >= 0; i--) {
        const char = code[i];
        if (char === ")") depth++;
        else if (char === "(") {
            if (depth === 0) {
                funcStart = i;
                break;
            }
            depth--;
        } else if (char === "," && depth === 0) {
            paramIndex++;
        }
    }

    if (funcStart === -1) return null;

    // Extract the function name before the parenthesis
    const beforeParen = code.slice(0, funcStart);
    const helperMatch = beforeParen.match(/helpers\.(\w+)$/);

    if (helperMatch) {
        const helperName = helperMatch[1];
        const helper = HELPERS_DEFINITIONS.find((h) => h.name === helperName);
        if (helper) {
            return {
                name: helper.name,
                signature: helper.signature,
                activeParam: paramIndex,
                params: helper.params,
            };
        }
    }

    return null;
}

function createSignatureTooltipDOM(info: SignatureInfo): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-signature-help";
    dom.style.cssText = `
        padding: 8px 12px;
        background: #282c34;
        border: 1px solid #3e4451;
        border-radius: 6px;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    // Build signature with highlighted active param
    let signatureHtml = `<div style="font-family: monospace; color: #abb2bf; margin-bottom: 6px;">`;
    signatureHtml += `<span style="color: #61afef;">helpers.${info.name}</span>(`;

    info.params.forEach((param, idx) => {
        if (idx > 0) signatureHtml += ", ";
        const isActive = idx === info.activeParam;
        const style = isActive
            ? "background: rgba(97, 175, 239, 0.3); padding: 2px 4px; border-radius: 3px; font-weight: 600;"
            : "";
        signatureHtml += `<span style="${style}">${param.name}${param.optional ? "?" : ""}</span>`;
    });

    signatureHtml += `)</div>`;

    // Show active parameter description
    if (info.params[info.activeParam]) {
        const activeParam = info.params[info.activeParam];
        signatureHtml += `<div style="color: #888; font-size: 0.9em;">`;
        signatureHtml += `<span style="color: #e5c07b;">${activeParam.name}</span>: `;
        signatureHtml += `<span style="color: #98c379;">${activeParam.type}</span>`;
        signatureHtml += ` — ${activeParam.description}`;
        signatureHtml += `</div>`;
    }

    dom.innerHTML = signatureHtml;
    return dom;
}

// Effect to trigger signature help update
const updateSignatureEffect = StateEffect.define<void>();

// State field for managing signature help tooltip
export const signatureHelpField = StateField.define<Tooltip | null>({
    create() {
        return null;
    },
    update(tooltip, tr) {
        // Update on document changes or cursor movement
        if (!tr.docChanged && !tr.selection) return tooltip;

        const pos = tr.state.selection.main.head;
        const code = tr.state.doc.toString();
        const info = getSignatureAtPosition(code, pos);

        if (info) {
            return {
                pos: pos,
                above: true,
                strictSide: true,
                arrow: false,
                create: () => ({ dom: createSignatureTooltipDOM(info) }),
            };
        }

        return null;
    },
    provide: (f) => showTooltip.from(f),
});

/**
 * Extension that shows function signature help when typing inside helpers.xxx()
 */
export function luaSignatureHelp() {
    return [signatureHelpField];
}
