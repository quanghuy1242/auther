// =============================================================================
// LUA HOVER TOOLTIPS
// =============================================================================
// Provides documentation on hover for helpers.*, context.*, and Lua builtins

import { hoverTooltip, type Tooltip } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import {
    HELPERS_DEFINITIONS,
    CONTEXT_FIELDS_UNIVERSAL,
    CONTEXT_FIELDS_BY_HOOK,
    NESTED_TYPE_FIELDS,
    DISABLED_GLOBALS,
    DISABLED_GLOBAL_MESSAGES,
    LUA_KEYWORDS,
    LUA_BUILTIN_DOCS,
    type HelperDefinition,
    type ContextField,
} from "./definitions";
import { getVariablesInScope, resolveTableKeyAtPosition, formatLuaType as baseFormatLuaType } from "./type-inference";

// =============================================================================
// TABLE KEY CONTEXT DETECTION
// =============================================================================

/**
 * Check if a word at a given line position is a table key (not a function call/builtin)
 * This uses simple regex-based heuristics to detect patterns like:
 * - `{ key = value }`
 * - `{ ["key"] = value }`
 * - `key = value,` (inside table)
 */
function isTableKeyContext(lineText: string, wordStart: number, word: string): boolean {
    // Pattern 1: word is followed by '=' but not '==' (assignment in table)
    const afterWord = lineText.slice(wordStart + word.length).trim();
    if (afterWord.startsWith("=") && !afterWord.startsWith("==")) {
        // Check if we're inside curly braces (table context)
        const beforeWord = lineText.slice(0, wordStart);
        // Count open/close braces to see if we're inside a table
        const openBraces = (beforeWord.match(/{/g) || []).length;
        const closeBraces = (beforeWord.match(/}/g) || []).length;
        if (openBraces > closeBraces) {
            return true; // Inside table literal
        }
    }
    return false;
}

// =============================================================================


// =============================================================================
// TOOLTIP CONTENT BUILDERS
// =============================================================================

function createTooltipDOM(content: string): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "cm-tooltip-lua-hover";
    dom.innerHTML = content;
    dom.style.cssText = `
        padding: 8px 12px;
        max-width: 400px;
        font-size: 13px;
        line-height: 1.4;
    `;
    return dom;
}

function createHelperTooltip(helper: HelperDefinition): HTMLElement {
    return createTooltipDOM(`
        <div style="font-weight: 600; font-family: monospace; color: #61afef; margin-bottom: 6px;">
            ${helper.signature}
        </div>
        <div style="margin-bottom: 8px;">${helper.description}</div>
        ${helper.params.length > 0
            ? `
        <div style="font-size: 0.9em; opacity: 0.8;">
            <div style="font-weight: 500; margin-bottom: 4px;">Parameters:</div>
            ${helper.params
                .map(
                    (p) => `
                <div style="margin-left: 8px;">
                    <code style="color: #e5c07b;">${p.name}</code>${p.optional ? '<span style="opacity: 0.6">?</span>' : ""
                        }: <span style="color: #98c379;">${p.type}</span>
                    <span style="opacity: 0.7;"> — ${p.description}</span>
                </div>
            `
                )
                .join("")}
        </div>
        `
            : ""
        }
        <div style="font-size: 0.9em; margin-top: 6px;">
            <span style="font-weight: 500;">Returns:</span> 
            <code style="color: #98c379;">${helper.returns}</code>
        </div>
    `);
}

function createContextFieldTooltip(field: ContextField): HTMLElement {
    return createTooltipDOM(`
        <div style="font-weight: 600; font-family: monospace; margin-bottom: 4px;">
            <span style="color: #e5c07b;">context.${field.name}</span>
            <span style="opacity: 0.7;">: ${field.type}</span>
            ${field.optional ? '<span style="color: #888; font-size: 0.9em;"> (optional)</span>' : ""}
        </div>
        <div>${field.description}</div>
    `);
}

function createDisabledGlobalTooltip(globalName: string): HTMLElement {
    const message = DISABLED_GLOBAL_MESSAGES[globalName] || `'${globalName}' is disabled in the sandbox`;
    return createTooltipDOM(`
        <div style="color: #e06c75; font-weight: 600; margin-bottom: 4px;">
            ⚠️ Disabled Global
        </div>
        <div>${message}</div>
    `);
}

function createBuiltinTooltip(name: string, doc: { signature: string; description: string }): HTMLElement {
    return createTooltipDOM(`
        <div style="font-weight: 600; font-family: monospace; color: #c678dd; margin-bottom: 4px;">
            ${doc.signature}
        </div>
        <div>${doc.description}</div>
    `);
}

function createKeywordTooltip(keyword: string): HTMLElement {
    const keywordDocs: Record<string, string> = {
        if: "Conditional statement. Usage: if condition then ... end",
        then: "Follows 'if' or 'elseif' to start the conditional block",
        else: "Alternative branch in an if statement",
        elseif: "Additional conditional branch: elseif condition then ...",
        end: "Closes if, for, while, function, or do blocks",
        for: "Loop statement: for i = 1, 10 do ... end",
        while: "Loop while condition is true: while condition do ... end",
        repeat: "Loop that runs at least once: repeat ... until condition",
        until: "Condition to end a repeat loop",
        function: "Function declaration: function name(args) ... end",
        local: "Declares a local variable: local x = value",
        return: "Returns values from a function",
        break: "Exits the innermost loop",
        do: "Starts a new scope block",
        in: "Used in for-in loops: for k, v in pairs(t) do ... end",
        and: "Logical AND operator",
        or: "Logical OR operator",
        not: "Logical NOT operator",
        nil: "The null/nothing value",
        true: "Boolean true",
        false: "Boolean false",
        goto: "Jump to a label (use sparingly)",
    };

    return createTooltipDOM(`
        <div style="font-weight: 600; color: #c678dd; margin-bottom: 4px;">
            <code>${keyword}</code> <span style="opacity: 0.7;">(keyword)</span>
        </div>
        <div>${keywordDocs[keyword] || `Lua keyword`}</div>
    `);
}



// =============================================================================
// HELPER: Resolve Type from Chain (Adapted for Hover)
// =============================================================================

import { type VariableType, type LuaType } from "./type-inference";

export interface LuaHoverOptions {
    hookName?: string;
}

function resolveHoverChainType(chain: string[], variables: Map<string, VariableType>): LuaType | null {
    if (chain.length === 0) return null;

    let currentType: LuaType | null = null;
    const start = chain[0];

    // 1. Resolve start
    const variable = variables.get(start);
    if (variable) {
        currentType = variable.inferredType;
    } else if (start === "context") {
        currentType = { kind: "global", name: "context" };
    } else if (start === "helpers") {
        currentType = { kind: "global", name: "helpers" };
    } else {
        return null;
    }

    // 2. Resolve rest
    for (let i = 1; i < chain.length; i++) {
        if (!currentType) return null;
        const member = chain[i];

        if (currentType.kind === "global" && currentType.name === "context") {
            const typeMap: Record<string, string> = {
                user: "PipelineUser",
                session: "PipelineSession",
                apikey: "PipelineApiKey",
                client: "OAuthClient",
                request: "RequestInfo",
            };
            if (Object.keys(typeMap).includes(member)) {
                currentType = { kind: "context", contextObject: member };
            } else if (member === "prev") {
                currentType = { kind: "global", name: "prev" };
            } else if (member === "outputs") {
                currentType = { kind: "global", name: "outputs" };
            } else {
                return null;
            }
        }
        else if (currentType.kind === "context" && currentType.contextObject) {
            // Look up field in nested context object definitions
            const typeMap: Record<string, string> = {
                user: "PipelineUser",
                session: "PipelineSession",
                apikey: "PipelineApiKey",
                client: "OAuthClient",
                request: "RequestInfo",
            };
            const typeName: string = typeMap[currentType.contextObject];

            if (typeName && NESTED_TYPE_FIELDS[typeName]) {
                const field: ContextField | undefined = NESTED_TYPE_FIELDS[typeName].find(f => f.name === member);
                if (field) {
                    // Convert ContextField to LuaType for consistency
                    currentType = { kind: "primitive", name: field.type }; // approximation
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }
        else if (currentType.kind === "table" && currentType.fields) {
            currentType = currentType.fields.get(member) || null;
        }
        else {
            return null;
        }
    }

    return currentType;
}

export function createLuaHoverTooltip(options: LuaHoverOptions = {}) {
    const { hookName } = options;

    return hoverTooltip((view: EditorView, pos: number): Tooltip | null => {
        // Expand word to include dots for chain detection
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
        const col = pos - line.from;

        // Find chain boundaries (e.g. "response.body")
        let start = col;
        let end = col;
        while (start > 0 && /[\w.]/.test(text[start - 1])) start--;
        while (end < text.length && /[\w.]/.test(text[end])) end++;

        const fullChain = text.slice(start, end);

        // Find the specific word being hovered
        let wordStart = col;
        let wordEnd = col;
        while (wordStart > 0 && /\w/.test(text[wordStart - 1])) wordStart--;
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) wordEnd++;
        const word = text.slice(wordStart, wordEnd);

        if (!word) return null;

        const variables = getVariablesInScope(view.state.doc.toString(), line.from + wordStart);

        // Check for table key definition first (e.g. { a = 1 })
        // This is a special case where we are not hovering a variable but a key declaration
        const tableKey = resolveTableKeyAtPosition(view.state.doc.toString(), line.from + wordStart);
        if (tableKey) {
            const formatType = (t: typeof tableKey.type, depth = 0): string => baseFormatLuaType(t, depth);
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({
                    dom: createTooltipDOM(`
                        <div style="font-weight: 600; font-family: monospace; color: #9CDCFE; margin-bottom: 6px;">
                            (field) ${tableKey.name}: ${formatType(tableKey.type)}
                        </div>
                        <div style="font-size: 0.9em; opacity: 0.8;">
                           Table field definition
                        </div>
                    `)
                })
            };
        }

        // ---------------------------------------------------------------------
        // 1. Try resolving as a property chain first
        // ---------------------------------------------------------------------
        // Check if the word is part of a chain like "obj.field"
        // We only care if we are hovering over "field", or if "obj" is a table

        if (fullChain.includes(".") && fullChain !== word) {
            // Split chain up to the hovered word
            // e.g. "response.body" -> hovering "body" -> chain ["response", "body"]
            // e.g. "a.b.c" -> hovering "b" -> chain ["a", "b"]

            // Find where the hovered word is in the chain
            const chainParts = fullChain.split(".");
            const relativeStart = wordStart - start;

            // Approximate index of word in chain
            // This is heuristic but works for simple "a.b.c" cases
            let currentLen = 0;
            let targetIndex = -1;
            for (let i = 0; i < chainParts.length; i++) {
                if (currentLen === relativeStart) {
                    targetIndex = i;
                    break;
                }
                currentLen += chainParts[i].length + 1; // +1 for dot
            }

            if (targetIndex > 0) { // Must be at least the second part to be a property access
                const prefixChain = chainParts.slice(0, targetIndex + 1);
                const resolvedType = resolveHoverChainType(prefixChain, variables);

                if (resolvedType) {
                    return {
                        pos: line.from + wordStart,
                        above: true,
                        create: () => {
                            // Re-use formatting logic or simplified display
                            let typeDisplay = "unknown";
                            if (resolvedType.kind === "primitive") typeDisplay = resolvedType.name || "any";
                            else if (resolvedType.kind === "table") typeDisplay = "table";
                            else if (resolvedType.kind === "function") typeDisplay = "function(...)";

                            return {
                                dom: createTooltipDOM(`
                                    <div style="font-weight: 600; font-family: monospace; color: #61afef; margin-bottom: 6px;">
                                        ${prefixChain.join(".")}
                                    </div>
                                    <div style="margin-bottom: 8px;">Property of inferred type</div>
                                    <div style="font-size: 0.9em; opacity: 0.8;">
                                        Type: <code style="color: #98c379;">${typeDisplay}</code>
                                    </div>
                                 `)
                            };
                        }
                    };
                }
            }
        }


        // ---------------------------------------------------------------------
        // 2. Fallback to existing single-word checks
        // ---------------------------------------------------------------------

        // 0. Check for local variables/functions (Dynamic)
        // We do this first because locals shadow globals
        const local = variables.get(word);

        if (local) {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => {
                    const dom = document.createElement("div");
                    dom.className = "cm-tooltip-lua-hover";
                    dom.style.cssText = `
                        padding: 8px 12px;
                        max-width: 400px;
                        font-size: 13px;
                        line-height: 1.4;
                    `;

                    let signature = word;
                    const type = local.inferredType;

                    // Helper to format LuaType using the shared one but with our depth preference if needed
                    // Actually, let's just use the imported formatLuaType (baseFormatLuaType)
                    const formatType = (t: typeof type, depth = 0): string => baseFormatLuaType(t, depth);

                    signature = `${word}: ${formatType(type)}`;

                    dom.innerHTML = `
                        <div style="font-weight: 600; font-family: monospace; color: #61afef; margin-bottom: 6px; white-space: pre-wrap;">${signature}</div>
                        ${local.kind === "upvalue" ? '<div style="color: #abb2bf; font-style: italic; margin-bottom: 4px; font-size: 0.9em;">Upvalue from outer scope</div>' : ""}
                        <div style="margin-bottom: 8px;">${local.doc?.description || ""}</div>
                        ${local.doc?.params?.length ? `
                        <div style="font-size: 0.9em; opacity: 0.8;">
                            <div style="font-weight: 500; margin-bottom: 4px;">Parameters:</div>
                            ${local.doc.params.map(p => `
                                <div style="margin-left: 8px;">
                                    <code style="color: #e5c07b;">${p.name}</code>: <span style="color: #98c379;">${p.type}</span>
                                    <span style="opacity: 0.7;"> — ${p.description}</span>
                                </div>
                            `).join("")}
                        </div>
                        ` : ""}
                        ${local.doc?.returns ? `
                        <div style="font-size: 0.9em; margin-top: 6px;">
                            <span style="font-weight: 500;">Returns:</span> 
                            <code style="color: #98c379;">${local.doc.returns.type}</code>
                            <span style="opacity: 0.7;"> — ${local.doc.returns.description}</span>
                        </div>
                        ` : ""}
                        ${local.initNode ? `
                            <div style="font-size: 0.8em; margin-top: 8px; opacity: 0.6; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
                                Defined on line ${local.line}
                            </div>
                        ` : ""}
                    `;
                    return { dom };
                }
            };
        }

        // Check for helpers.xxx (Using fullChain to match)
        const helpersMatch = fullChain.match(/^helpers\.(\w+)$/);
        if (helpersMatch && (word === helpersMatch[1] || word === "helpers")) {
            // If hovering "fetch" in "helpers.fetch", OR hovering "helpers" (optional legacy behavior, ensuring we catch it)
            // Prioritize the method name if hovering the method
            if (word === helpersMatch[1]) {
                const helperName = helpersMatch[1];
                const helper = HELPERS_DEFINITIONS.find((h) => h.name === helperName);
                if (helper) {
                    return {
                        pos: line.from + wordStart,
                        above: true,
                        create: () => ({ dom: createHelperTooltip(helper) }),
                    };
                }
            }
        }

        // Check for "helpers" alone
        if (word === "helpers") {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({
                    dom: createTooltipDOM(`
                        <div style="font-weight: 600; color: #61afef; margin-bottom: 4px;">helpers</div>
                        <div>Pipeline helper functions for logging, hashing, HTTP requests, and more.</div>
                        <div style="margin-top: 8px; font-size: 0.9em; opacity: 0.8;">
                            Available: ${HELPERS_DEFINITIONS.map((h) => h.name).join(", ")}
                        </div>
                    `),
                }),
            };
        }

        // Check for context.xxx or context.user.xxx etc.
        const contextNestedMatch = fullChain.match(/^context\.(user|session|apikey|client|request)\.(\w+)$/);
        if (contextNestedMatch && word === contextNestedMatch[2]) {
            const [, objectName, fieldName] = contextNestedMatch;
            const typeMap: Record<string, string> = {
                user: "PipelineUser",
                session: "PipelineSession",
                apikey: "PipelineApiKey",
                client: "OAuthClient",
                request: "RequestInfo",
            };
            const typeName = typeMap[objectName];
            if (typeName) {
                const fields = NESTED_TYPE_FIELDS[typeName];
                const field = fields?.find((f) => f.name === fieldName);
                if (field) {
                    return {
                        pos: line.from + wordStart,
                        above: true,
                        create: () => ({
                            dom: createTooltipDOM(`
                        <div style="font-weight: 600; font-family: monospace; margin-bottom: 4px;">
                            <span style="color: #e5c07b;">context.${objectName}.${field.name}</span>
                            <span style="opacity: 0.7;">: ${field.type}</span>
                        </div>
                        <div>${field.description}</div>
                        `),
                        }),
                    };
                }
            }
        }

        // Check for context.xxx (universal fields)
        const contextMatch = fullChain.match(/^context\.(\w+)$/);
        if (contextMatch && (word === contextMatch[1])) {
            const fieldName = contextMatch[1];

            // Check universal fields
            let field = CONTEXT_FIELDS_UNIVERSAL.find((f) => f.name === fieldName);

            // Check hook-specific fields
            if (!field && hookName && CONTEXT_FIELDS_BY_HOOK[hookName]) {
                field = CONTEXT_FIELDS_BY_HOOK[hookName].find((f) => f.name === fieldName);
            }

            // Check all hooks if not found
            if (!field) {
                for (const fields of Object.values(CONTEXT_FIELDS_BY_HOOK)) {
                    field = fields.find((f) => f.name === fieldName);
                    if (field) break;
                }
            }

            if (field) {
                return {
                    pos: line.from + wordStart,
                    above: true,
                    create: () => ({ dom: createContextFieldTooltip(field) }),
                };
            }
        }

        // Check for "context" alone
        if (word === "context") {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({
                    dom: createTooltipDOM(`
                                        <div style="font-weight: 600; color: #e5c07b; margin-bottom: 4px;">context</div>
                                        <div>Hook-specific context object containing request data and user info.</div>
                                        <div style="margin-top: 8px; font-size: 0.9em; opacity: 0.8;">
                                            Universal fields: ${CONTEXT_FIELDS_UNIVERSAL.map((f) => f.name).join(", ")}
                                        </div>
                `),
                }),
            };
        }

        // Check for context.prev
        if (fullChain === "context.prev" && word === "prev") {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({
                    dom: createTooltipDOM(`
                <div style="font-weight: 600; font-family: monospace; margin-bottom: 4px;">
                    <span style="color: #e5c07b;">context.prev</span>
                    <span style="opacity: 0.7;">: table | nil</span>
                </div>
                <div style="margin-bottom: 8px;">
                    Merged data from the previous script layer in the pipeline.
                </div>
                <div style="font-size: 0.9em; opacity: 0.8;">
                    <div style="font-weight: 500; margin-bottom: 4px;">Common fields:</div>
                    <div style="margin-left: 8px;">
                        <code style="color: #98c379;">allowed</code> — Whether previous script allowed the action<br/>
                        <code style="color: #98c379;">data</code> — Data returned by previous script<br/>
                        <code style="color: #98c379;">error</code> — Error message if blocked
                    </div>
                </div>
                `),
                }),
            };
        }

        // Check for context.outputs
        if ((fullChain === "context.outputs" && word === "outputs") || (fullChain.startsWith("context.outputs") && word === "outputs")) {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({
                    dom: createTooltipDOM(`
                                                            <div style="font-weight: 600; font-family: monospace; margin-bottom: 4px;">
                                                                <span style="color: #e5c07b;">context.outputs</span>
                                                                <span style="opacity: 0.7;">: table&lt;string, table&gt;</span>
                                                            </div>
                                                            <div style="margin-bottom: 8px;">
                                                                Outputs from all previous scripts, keyed by script ID.
                                                            </div>
                                                            <div style="font-size: 0.9em; opacity: 0.8;">
                                                                <div style="font-weight: 500; margin-bottom: 4px;">Usage:</div>
                                                                <div style="background: rgba(0,0,0,0.2); padding: 6px; border-radius: 4px; font-family: monospace;">
                                                                    local prev = context.outputs["script-id"]<br/>
                                                                    if prev and prev.allowed then ... end
                                                                </div>
                                                            </div>
        `),
                }),
            };
        }

        // Check for disabled globals
        if (DISABLED_GLOBALS.includes(word as (typeof DISABLED_GLOBALS)[number])) {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({ dom: createDisabledGlobalTooltip(word) }),
            };
        }

        // Check for Lua builtins (but NOT if it's a table key like { error = "..." })
        if (LUA_BUILTIN_DOCS[word] && !isTableKeyContext(text, wordStart, word)) {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({ dom: createBuiltinTooltip(word, LUA_BUILTIN_DOCS[word]) }),
            };
        }

        // Check for string.xxx, table.xxx, math.xxx
        const libMatch = fullChain.match(/^(string|table|math)\.(\w+)$/);
        if (libMatch && word === libMatch[2]) {
            const fullName = fullChain;
            if (LUA_BUILTIN_DOCS[fullName]) {
                return {
                    pos: line.from + wordStart,
                    above: true,
                    create: () => ({ dom: createBuiltinTooltip(fullName, LUA_BUILTIN_DOCS[fullName]) }),
                };
            }
        }

        // Check for Lua keywords
        if (LUA_KEYWORDS.includes(word as (typeof LUA_KEYWORDS)[number])) {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({ dom: createKeywordTooltip(word) }),
            };
        }

        return null;
    });
}
