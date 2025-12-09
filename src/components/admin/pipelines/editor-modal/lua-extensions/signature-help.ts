// =============================================================================
// LUA FUNCTION SIGNATURE HELP
// =============================================================================
// Shows parameter hints when typing inside function calls

import { showTooltip, Tooltip, keymap } from "@codemirror/view";
import { StateField, StateEffect, Prec } from "@codemirror/state";
import { completionStatus } from "@codemirror/autocomplete";


// =============================================================================
// SIGNATURE HELP TOOLTIP
// =============================================================================

interface SignatureInfo {
    name: string;
    signature: string;
    activeParam: number;
    params: Array<{ name: string; type: string; description: string; optional?: boolean }>;
    isHelper: boolean;
    range: { from: number; to: number };
}

import {
    resolveNodeAtPosition,
    inferExpressionType,
    type LuaNode
} from "./type-inference";
import luaparse from "luaparse";

export function getSignatureAtPosition(code: string, pos: number): SignatureInfo | null {
    // 1. Repair code if needed (unclosed parens)
    let codeToUse = code;

    // Attempt resolve with original code
    let resolved = resolveNodeAtPosition(codeToUse, pos);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasCallExpression = (res: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return res?.path.some((n: any) =>
            n.type === "CallExpression" ||
            n.type === "StringCallExpression" ||
            n.type === "TableCallExpression"
        );
    };

    if (!resolved || !hasCallExpression(resolved)) {
        // Try repairing: append ")" (assumes we are in a call)
        try {
            luaparse.parse(code, { wait: false, luaVersion: "5.3" });
        } catch {
            // Parse failed. Try appending closing chars.
            // Heuristic strategies:
            // Parse failed. Try repairing by injecting tokens AT CURSOR.
            // This handles interruptions in the middle of code.
            const repairs = [
                "0",         // Argument placeholder (func(a, |) -> func(a, 0))
                ")",         // Closing paren
                "0)",        // Arg + Close
                "''",        // String
                "{}",        // Table
                " end",      // Block close (appended)
            ];
            for (const repair of repairs) {
                try {
                    let candidate = "";
                    if (repair === " end") {
                        candidate = code + repair;
                    } else {
                        candidate = code.slice(0, pos) + repair + code.slice(pos);
                    }
                    // Debug: Check if candidate parses cleanly?
                    // const { parseError } = require("./type-inference").inferVariableTypes(candidate);
                    // console.log("Parse Error:", parseError);

                    // We parse purely to see if it generates a valid AST that includes our node
                    // But we must use inferVariableTypes logic? 
                    // No, here we just want a valid AST to resolve the node.
                    // If we use inferVariableTypes, it swallows errors, which is good!
                    // But we need to use the CANDIDATE code to find call node.
                    // resolveNodeAtPosition internally calls inferVariableTypes(code).

                    // Note: resolvedNodeAtPosition now uses inferVariableTypes which uses partial AST.
                    // So we might not even NEED this repair if partial AST works well?
                    // But partial AST might not build the CallExpression if syntax is too broken.
                    // So we still try to provide a "cleaner" version.

                    // However, if we injected text, the 'pos' might need shifting?
                    // We want the node at the ORIGINAL pos.
                    // If we injected "0" at pos, the node at pos is "0".
                    // That's fine, we want the CallExpression covering it.

                    resolved = resolveNodeAtPosition(candidate, pos);
                    if (resolved) {
                        codeToUse = candidate;
                        break;
                    }
                } catch { continue; }
            }
        }
    }

    if (!resolved) return null;

    const { path, scope } = resolved;

    // 2. Find closest CallExpression
    // We walk up the path.
    // path is [root, ..., parent, node]
    // We want the closest CallExpression that CONTAINS the cursor in its arguments or between parens.
    let callNode: LuaNode | null = null;

    for (let i = path.length - 1; i >= 0; i--) {
        const node = path[i];
        if (node.type === "CallExpression" || node.type === "StringCallExpression" || node.type === "TableCallExpression") {
            callNode = node;
            break;
        }
    }

    if (!callNode) return null;

    // Ensure we are inside the arguments range (or at the parens)
    // CallExpression: base(arguments)
    // If String/Table call, it's specific syntax.

    // For standard CallExpression:
    if (callNode.type === "CallExpression") {
        // Check if we are in the base? (e.g. helpers.|( )) -> No, we want to be after base.
        const base = callNode.base;
        if (pos <= base.range[1]) {
            // We are editing the function name, not args.
            // Unless base includes parentheses? No.
            // But check if we are *exactly* at the opening paren?
            // If pos is immediately after base but before first arg?
            return null;
        }
    }

    // 3. Infer Function Type
    const baseType = inferExpressionType(callNode.base, scope);
    if (!baseType || baseType.kind !== "function") return null;

    // 4. Determine Active Parameter
    // Iterate arguments to find where cursor fits.
    let activeParam = 0;
    const args = callNode.arguments || [];

    if (callNode.type === "CallExpression") {
        // args is Expression[]
        // We need to account for commas. AST doesn't give comma locations directly, 
        // but ranges of args give clues.

        // If no args, we are at param 0.
        if (args.length === 0) {
            activeParam = 0;
        } else {
            // Find insertion point
            // arg1, arg2, arg3
            // if pos <= arg1.end -> 0 (or inside arg1)
            // if pos > arg1.end && pos <= arg2.end -> 1
            // Caveat: if pos is in whitespace/comma between arg1 and arg2?

            let found = false;
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                // If cursor is *before* start of this arg, it might be in previous comma area -> belongs to current index?
                // or if cursor is *inside* this arg -> current index

                // Logic:
                // If pos <= arg.end, then it's this arg (or before it)
                // But we need to handle "after arg1, before arg2"

                // Check if pos is strictly within arg range
                if (pos >= arg.range[0] && pos <= arg.range[1]) {
                    activeParam = i;
                    found = true;
                    break;
                }

                // Check if pos is before this arg (implies previous comma passed)
                if (pos < arg.range[0]) {
                    activeParam = i;
                    found = true;
                    break;
                }

                // If pos > arg.end, continue to next.
            }

            if (!found) {
                // Cursor is after the last argument
                activeParam = args.length;
                // Note: Lua allows extra commas. "f(a,)" -> args length 1. Cursor after comma -> param 1.
                // We might need to check if there is a comma after the last arg in the source code.
                // If pos > arg.end, continue to next.
            }

            if (!found) {
                // Cursor is after the last argument
                // Check if there's a comma after the last arg
                const lastArg = args[args.length - 1];
                const textAfterLastArg = codeToUse.slice(lastArg.range[1], pos);

                // If there's a comma between the last arg and cursor, we are on the NEXT active param
                if (textAfterLastArg.indexOf(",") !== -1) {
                    activeParam = args.length;

                    // Special case for our repair: "func(a, 0)"
                    // If we injected a "0" at the cursor, args.length includes it.
                    // But the cursor is BEFORE it?
                    // If we repaired `func(a, )` -> `func(a, 0)`, cursor is at start of `0`.
                    // `args` has `a` and `0`.
                    // The loop above `pos < arg.range[0]` for the `0` argument should have caught it?
                    // If we injected `0` AT pos, then `arg.range[0]` === `pos`.
                    // `pos < arg.range[0]` is false.
                    // `pos >= arg.range[0]` is true.
                    // So it matched `activeParam = i`.
                } else {
                    activeParam = args.length - 1;
                }
            }
        }
    } else if (callNode.type === "StringCallExpression") {
        // func "str" -> param 0
        activeParam = 0;
    } else if (callNode.type === "TableCallExpression") {
        // func { } -> param 0
        activeParam = 0;
    }

    // 5. Construct Result
    // Use baseType.doc (primary) or baseType.params (inferred)
    const docParams = baseType.doc?.params || [];
    const inferredParams = baseType.params || [];

    // Merge info: Prefer doc params
    const displayParams: Array<{ name: string; type: string; description: string; optional?: boolean }> = [];

    // If we have doc params, use them primarily
    if (docParams.length > 0) {
        docParams.forEach(dp => {
            displayParams.push({
                name: dp.name,
                type: dp.type,
                description: dp.description || "",
                optional: dp.optional
            });
        });
    } else if (inferredParams.length > 0) {
        // Use inferred params
        inferredParams.forEach(p => {
            displayParams.push({
                name: p.name || "arg",
                type: p.kind || "any",
                description: "",
                optional: false
            });
        });
    }

    // If activeParam exceeds defined params, stick to last (or show varargs?)
    // If function is vararg, finding description for ... is hard.

    const funcName = baseType.name || "function";
    const signature = baseType.doc?.signature || `${funcName}(${displayParams.map(p => p.name).join(", ")})`;

    const isHelper = funcName.startsWith("helpers.");

    return {
        name: funcName,
        signature,
        activeParam,
        params: displayParams,
        isHelper,
        range: { from: callNode.range ? callNode.range[0] : 0, to: callNode.range ? callNode.range[1] : 0 }
    };
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

// Effect to close signature help
export const closeSignatureHelp = StateEffect.define<null>();

interface SignatureHelpState {
    tooltip: Tooltip | null;
    activeCallRange: { from: number, to: number } | null;
    suppressed: boolean;
}

// State field for managing signature help tooltip
export const signatureHelpField = StateField.define<SignatureHelpState>({
    create() {
        return { tooltip: null, activeCallRange: null, suppressed: false };
    },
    update(state, tr) {
        // Handle explicit close
        for (const effect of tr.effects) {
            if (effect.is(closeSignatureHelp)) {
                return {
                    tooltip: null,
                    activeCallRange: state.activeCallRange,
                    suppressed: true
                };
            }
        }

        // Reset suppression on document changes
        let suppressed = state.suppressed;
        if (tr.docChanged) {
            suppressed = false;
        }

        // If no changes that affect signature help, return existing state
        // BUT we must allow reopening if suppressed becomes false?
        // If docChanged, we proceed to calc info.
        if (!tr.docChanged && !tr.selection) {
            return state;
        }

        const pos = tr.state.selection.main.head;
        const code = tr.state.doc.toString();
        const info = getSignatureAtPosition(code, pos);

        if (info) {
            // Check if we are still in the same call
            const isSameCall = state.activeCallRange &&
                info.range.from === state.activeCallRange.from &&
                info.range.to === state.activeCallRange.to;

            if (isSameCall && suppressed) {
                return { tooltip: null, activeCallRange: info.range, suppressed: true };
            }

            // Show tooltip
            return {
                tooltip: {
                    pos: pos,
                    above: true,
                    strictSide: true,
                    arrow: false,
                    create: () => ({ dom: createSignatureTooltipDOM(info) }),
                },
                activeCallRange: info.range,
                suppressed: false
            };
        }

        // No signature info found -> Clear state
        return { tooltip: null, activeCallRange: null, suppressed: false };
    },
    provide: (f) => showTooltip.from(f, (val) => val.tooltip),
});

/**
 * Extension that shows function signature help when typing inside helpers.xxx() or local functions
 */
export function luaSignatureHelp() {
    return [
        signatureHelpField,
        Prec.highest(
            keymap.of([{
                key: "Escape",
                run: (view) => {
                    // Prioritize closing autocomplete if it's open
                    const status = completionStatus(view.state);
                    if (status === "active") return false;

                    const current = view.state.field(signatureHelpField, false);
                    if (current && current.tooltip) {
                        view.dispatch({ effects: closeSignatureHelp.of(null) });
                        return true;
                    }
                    return false;
                }
            }])
        )
    ];
}
