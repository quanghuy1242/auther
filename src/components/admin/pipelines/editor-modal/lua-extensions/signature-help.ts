// =============================================================================
// LUA FUNCTION SIGNATURE HELP
// =============================================================================
// Shows parameter hints when typing inside function calls

import { showTooltip, Tooltip } from "@codemirror/view";
import { StateField } from "@codemirror/state";
import { HELPERS_DEFINITIONS } from "./definitions";
import { inferVariableTypes } from "./type-inference";

// =============================================================================
// SIGNATURE HELP TOOLTIP
// =============================================================================

interface SignatureInfo {
    name: string;
    signature: string;
    activeParam: number;
    params: Array<{ name: string; type: string; description: string; optional?: boolean }>;
    isHelper: boolean;
}

function getSignatureAtPosition(code: string, pos: number): SignatureInfo | null {
    // Look backwards to find an open parenthesis
    let depth = 0;
    let paramIndex = 0;
    let funcStart = -1;

    // Scan backwards from cursor
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
        } else if (char === "\n") {
            // Stop at newline if depth is 0 to avoid scanning too far back incorrectly
            if (depth === 0) break;
        }
    }

    if (funcStart === -1) return null;

    // Extract the function name before the parenthesis
    const beforeParen = code.slice(0, funcStart).trim();

    // 1. Check for helpers.xxx
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
                isHelper: true,
            };
        }
    }

    // 2. Check for local functions (Dynamic)
    // Find the word immediately preceding the parenthesis
    const localMatch = beforeParen.match(/([\w.]+)$/);
    if (localMatch) {
        const funcName = localMatch[1];
        // Infer types dynamically
        const { variables } = inferVariableTypes(code);
        const local = variables.get(funcName);

        if (local && local.type === "function") {
            const params = (local.functionParams || []).map((name) => {
                // Try to match with doc params
                const docParam = local.doc?.params.find(p => p.name === name);
                return {
                    name,
                    type: docParam?.type || "any",
                    description: docParam?.description || "",
                    optional: false
                };
            });

            // If not enough doc params but we have function params, use those
            // If we have more doc params (e.g. named args pattern), rely on doc params if functionParams is empty?
            // For now, rely on parsed function params as primary source of truth for count/names

            // Construct signature string: name(p1, p2)
            const signature = `${funcName}(${params.map(p => p.name).join(", ")})`;

            return {
                name: funcName,
                signature,
                activeParam: paramIndex,
                params,
                isHelper: false
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
        z-index: 1000;
    `;

    // Build signature with highlighted active param
    let signatureHtml = `<div style="font-family: monospace; color: #abb2bf; margin-bottom: 6px;">`;

    const prefix = info.isHelper ? "helpers." : "";
    signatureHtml += `<span style="color: #61afef;">${prefix}${info.name}</span>(`;

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
        signatureHtml += `<span style="color: #e5c07b;">${activeParam.name}</span>`;
        if (activeParam.type !== "any") {
            signatureHtml += `: <span style="color: #98c379;">${activeParam.type}</span>`;
        }
        if (activeParam.description) {
            signatureHtml += ` — ${activeParam.description}`;
        }
        signatureHtml += `</div>`;
    }

    dom.innerHTML = signatureHtml;
    return dom;
}

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
 * Extension that shows function signature help when typing inside helpers.xxx() or local functions
 */
export function luaSignatureHelp() {
    return [signatureHelpField];
}
