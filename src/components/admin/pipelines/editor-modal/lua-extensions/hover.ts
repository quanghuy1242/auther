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
    type HelperDefinition,
    type ContextField,
} from "./definitions";

// =============================================================================
// LUA BUILTIN DOCUMENTATION
// =============================================================================

const LUA_BUILTIN_DOCS: Record<string, { signature: string; description: string }> = {
    pairs: {
        signature: "pairs(t)",
        description: "Returns an iterator function for traversing all key-value pairs in table t.",
    },
    ipairs: {
        signature: "ipairs(t)",
        description:
            "Returns an iterator function for traversing the array part of table t (integer keys 1, 2, 3...).",
    },
    tonumber: {
        signature: "tonumber(e, base?)",
        description:
            "Converts e to a number. If e is already a number, returns it. Otherwise tries to parse as number.",
    },
    tostring: {
        signature: "tostring(v)",
        description: "Converts any value to a string.",
    },
    type: {
        signature: "type(v)",
        description:
            'Returns the type of v as a string: "nil", "number", "string", "boolean", "table", "function", etc.',
    },
    print: {
        signature: "print(...)",
        description: "Prints values to stdout (goes to execution log in sandbox).",
    },
    error: {
        signature: "error(message, level?)",
        description: "Raises an error with the given message.",
    },
    pcall: {
        signature: "pcall(f, ...)",
        description: "Calls f with the given arguments in protected mode. Returns success status and result/error.",
    },
    assert: {
        signature: "assert(v, message?)",
        description: "Raises an error if v is false or nil.",
    },
    select: {
        signature: 'select(index, ...)',
        description: 'Returns arguments after index, or "#" returns count of arguments.',
    },
    next: {
        signature: "next(t, key?)",
        description: "Returns next key-value pair in table after key.",
    },
    getmetatable: {
        signature: "getmetatable(t)",
        description: "Returns the metatable of t, or nil if none.",
    },
    setmetatable: {
        signature: "setmetatable(t, mt)",
        description: "Sets the metatable of t to mt and returns t.",
    },
    unpack: {
        signature: "unpack(list, i?, j?)",
        description: "Returns elements from list[i] to list[j].",
    },
    // String library
    "string.sub": {
        signature: "string.sub(s, i, j?)",
        description: "Returns substring from position i to j.",
    },
    "string.len": {
        signature: "string.len(s)",
        description: "Returns the length of string s.",
    },
    "string.find": {
        signature: "string.find(s, pattern, init?, plain?)",
        description: "Finds first match of pattern in s.",
    },
    "string.match": {
        signature: "string.match(s, pattern, init?)",
        description: "Returns captures from pattern match.",
    },
    "string.gsub": {
        signature: "string.gsub(s, pattern, repl, n?)",
        description: "Global substitution of pattern matches.",
    },
    "string.format": {
        signature: "string.format(fmt, ...)",
        description: "Formats values according to format string.",
    },
    "string.lower": {
        signature: "string.lower(s)",
        description: "Returns lowercase version of s.",
    },
    "string.upper": {
        signature: "string.upper(s)",
        description: "Returns uppercase version of s.",
    },
    // Table library
    "table.insert": {
        signature: "table.insert(t, pos?, value)",
        description: "Inserts value into array t at position pos.",
    },
    "table.remove": {
        signature: "table.remove(t, pos?)",
        description: "Removes and returns element at position pos.",
    },
    "table.concat": {
        signature: "table.concat(t, sep?, i?, j?)",
        description: "Concatenates array elements into string.",
    },
    "table.sort": {
        signature: "table.sort(t, comp?)",
        description: "Sorts array t in-place.",
    },
    // Math library
    "math.abs": {
        signature: "math.abs(x)",
        description: "Returns absolute value of x.",
    },
    "math.floor": {
        signature: "math.floor(x)",
        description: "Returns largest integer <= x.",
    },
    "math.ceil": {
        signature: "math.ceil(x)",
        description: "Returns smallest integer >= x.",
    },
    "math.min": {
        signature: "math.min(x, ...)",
        description: "Returns minimum value.",
    },
    "math.max": {
        signature: "math.max(x, ...)",
        description: "Returns maximum value.",
    },
    "math.random": {
        signature: "math.random(m?, n?)",
        description: "Returns random number.",
    },
};

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
// WORD EXTRACTION
// =============================================================================

function getWordAtPosition(view: EditorView, pos: number): { word: string; from: number; to: number } | null {
    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    const col = pos - line.from;

    // Find word boundaries
    let start = col;
    let end = col;

    // Expand backwards
    while (start > 0 && /[\w.]/.test(text[start - 1])) {
        start--;
    }

    // Expand forwards
    while (end < text.length && /\w/.test(text[end])) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) return null;

    return { word, from: line.from + start, to: line.from + end };
}

// =============================================================================
// MAIN HOVER TOOLTIP
// =============================================================================

export interface LuaHoverOptions {
    hookName?: string;
}

export function createLuaHoverTooltip(options: LuaHoverOptions = {}) {
    const { hookName } = options;

    return hoverTooltip((view: EditorView, pos: number): Tooltip | null => {
        const wordInfo = getWordAtPosition(view, pos);
        if (!wordInfo) return null;

        const { word, from } = wordInfo;

        // Check for helpers.xxx
        const helpersMatch = word.match(/^helpers\.(\w+)$/);
        if (helpersMatch) {
            const helperName = helpersMatch[1];
            const helper = HELPERS_DEFINITIONS.find((h) => h.name === helperName);
            if (helper) {
                return {
                    pos: from,
                    above: true,
                    create: () => ({ dom: createHelperTooltip(helper) }),
                };
            }
        }

        // Check for "helpers" alone
        if (word === "helpers") {
            return {
                pos: from,
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
        const contextNestedMatch = word.match(/^context\.(user|session|apikey|client|request)\.(\w+)$/);
        if (contextNestedMatch) {
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
                        pos: from,
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

        // Check for context.xxx
        const contextMatch = word.match(/^context\.(\w+)$/);
        if (contextMatch) {
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
                    pos: from,
                    above: true,
                    create: () => ({ dom: createContextFieldTooltip(field) }),
                };
            }
        }

        // Check for "context" alone
        if (word === "context") {
            return {
                pos: from,
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
        if (word === "context.prev") {
            return {
                pos: from,
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
        if (word === "context.outputs" || word.startsWith("context.outputs")) {
            return {
                pos: from,
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
                pos: from,
                above: true,
                create: () => ({ dom: createDisabledGlobalTooltip(word) }),
            };
        }

        // Check for Lua builtins
        if (LUA_BUILTIN_DOCS[word]) {
            return {
                pos: from,
                above: true,
                create: () => ({ dom: createBuiltinTooltip(word, LUA_BUILTIN_DOCS[word]) }),
            };
        }

        // Check for string.xxx, table.xxx, math.xxx
        const libMatch = word.match(/^(string|table|math)\.(\w+)$/);
        if (libMatch) {
            const fullName = word;
            if (LUA_BUILTIN_DOCS[fullName]) {
                return {
                    pos: from,
                    above: true,
                    create: () => ({ dom: createBuiltinTooltip(fullName, LUA_BUILTIN_DOCS[fullName]) }),
                };
            }
        }

        // Check for Lua keywords
        if (LUA_KEYWORDS.includes(word as (typeof LUA_KEYWORDS)[number])) {
            return {
                pos: from,
                above: true,
                create: () => ({ dom: createKeywordTooltip(word) }),
            };
        }

        return null;
    });
}
