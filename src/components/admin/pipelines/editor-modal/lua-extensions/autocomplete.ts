// =============================================================================
// LUA AUTOCOMPLETE SOURCES
// =============================================================================
// Custom completion sources for helpers.*, context.*, Lua keywords, and snippets

import { snippet, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import {
    HELPERS_DEFINITIONS,
    CONTEXT_FIELDS_UNIVERSAL,
    CONTEXT_FIELDS_BY_HOOK,
    LUA_KEYWORDS,
    LUA_BUILTINS,
    LUA_BUILTIN_DOCS,
    SNIPPET_TEMPLATES,
    NESTED_TYPE_FIELDS,
    type HelperDefinition,
    type ContextField,
} from "./definitions";
import { extractReturnSchema, getVariablesInScope, type ReturnSchema, type VariableType, type LuaType } from "./type-inference";

// =============================================================================
// HELPER COMPLETIONS
// =============================================================================

function getHelperCompletions(): Completion[] {
    return HELPERS_DEFINITIONS.map((helper: HelperDefinition) => ({
        label: helper.name,
        type: "function",
        detail: helper.signature,
        info: () => {
            const div = document.createElement("div");
            div.className = "cm-completion-info-lua";
            div.style.cssText = "padding: 8px; max-width: 350px; font-size: 13px; line-height: 1.4;";

            // Build HTML without whitespace issues
            let html = `<div style="font-weight: 600; margin-bottom: 4px;">${helper.signature}</div>`;
            html += `<div style="margin-bottom: 8px;">${helper.description}</div>`;

            if (helper.params.length > 0) {
                html += `<div style="font-size: 0.9em; color: #888;"><strong>Parameters:</strong>`;
                html += `<ul style="margin: 4px 0; padding-left: 16px;">`;
                for (const p of helper.params) {
                    html += `<li><code>${p.name}</code>${p.optional ? "?" : ""}: ${p.type} - ${p.description}</li>`;
                }
                html += `</ul></div>`;
            }

            html += `<div style="font-size: 0.9em; color: #888;"><strong>Returns:</strong> <code>${helper.returns}</code></div>`;

            if (helper.example) {
                html += `<div style="margin-top: 8px; padding: 6px; background: rgba(0,0,0,0.2); border-radius: 4px; font-family: monospace; font-size: 0.85em; white-space: pre-wrap;">${helper.example}</div>`;
            }

            div.innerHTML = html;
            return div;
        },
        boost: 10,
    }));
}

function getBuiltinLibraryCompletions(libName: string): Completion[] {
    const prefix = `${libName}.`;
    return Object.entries(LUA_BUILTIN_DOCS)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, doc]) => ({
            label: key.slice(prefix.length),
            type: "function",
            detail: doc.signature,
            info: doc.description,
            boost: 5,
        }));
}

// =============================================================================
// CONTEXT COMPLETIONS
// =============================================================================

function getContextCompletions(hookName?: string): Completion[] {
    const completions: Completion[] = [];

    // Add universal fields
    CONTEXT_FIELDS_UNIVERSAL.forEach((field: ContextField) => {
        completions.push({
            label: field.name,
            type: "property",
            detail: field.type,
            info: field.description,
            boost: 8,
        });
    });

    // Add hook-specific fields if hook is known
    if (hookName && CONTEXT_FIELDS_BY_HOOK[hookName]) {
        CONTEXT_FIELDS_BY_HOOK[hookName].forEach((field: ContextField) => {
            completions.push({
                label: field.name,
                type: "property",
                detail: field.type + (field.optional ? " (optional)" : ""),
                info: field.description,
                boost: 9, // Higher boost for hook-specific fields
            });
        });
    } else {
        // If no hook specified, add commonly available fields
        const commonFields = new Set<string>();
        Object.values(CONTEXT_FIELDS_BY_HOOK).forEach((fields) => {
            fields.forEach((field) => {
                if (!commonFields.has(field.name)) {
                    commonFields.add(field.name);
                    completions.push({
                        label: field.name,
                        type: "property",
                        detail: field.type + (field.optional ? " (optional)" : ""),
                        info: field.description,
                        boost: 5,
                    });
                }
            });
        });
    }

    return completions;
}

// =============================================================================
// NESTED OBJECT COMPLETIONS (context.user.*, context.request.*, etc.)
// =============================================================================

function getNestedObjectCompletions(typeName: string): Completion[] {
    const fields = NESTED_TYPE_FIELDS[typeName];
    if (!fields) return [];

    return fields.map((field: ContextField) => ({
        label: field.name,
        type: "property",
        detail: field.type + (field.optional ? " (optional)" : ""),
        info: field.description,
        boost: 7,
    }));
}

// =============================================================================
// LUA KEYWORD AND BUILTIN COMPLETIONS
// =============================================================================

function getKeywordCompletions(): Completion[] {
    return LUA_KEYWORDS.map((keyword) => ({
        label: keyword,
        type: "keyword",
        boost: -1, // Lower priority than helpers/context
    }));
}

function getBuiltinCompletions(): Completion[] {
    return LUA_BUILTINS.map((builtin) => ({
        label: builtin,
        type: "function",
        detail: "Lua builtin",
        boost: 0,
    }));
}

// =============================================================================
// SNIPPET COMPLETIONS
// =============================================================================

function getSnippetCompletions(): Completion[] {
    return SNIPPET_TEMPLATES.map((snippet) => ({
        label: snippet.label,
        type: "text",
        detail: snippet.detail,
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
            // Simple template insertion (CodeMirror doesn't have native snippets like VSCode)
            // Replace ${1:placeholder} with just the placeholder text
            const text = snippet.template.replace(/\$\{\d+:([^}]+)\}/g, "$1").replace(/\$\{\d+\}/g, "");
            view.dispatch({
                changes: { from, to, insert: text },
                selection: { anchor: from + text.length },
            });
        },
        boost: -2, // Lower priority than keywords
    }));
}

// =============================================================================
// MAIN COMPLETION SOURCE
// =============================================================================

export interface LuaCompletionOptions {
    hookName?: string;
    /**
     * Code from the previous script layer (if any).
     * Used to infer context.prev schema for dynamic completions.
     */
    previousScriptCode?: string;
    /**
     * Map of script IDs to their return schemas.
     * Used for context.outputs["id"].* completions.
     */
    scriptOutputs?: Map<string, ReturnSchema>;
}

// =============================================================================
// HELPER: Resolve Type from Chain
// =============================================================================

function resolveLuaType(chain: string[], variables: Map<string, VariableType>): LuaType | null {
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
    } else if (["string", "math", "table"].includes(start)) {
        currentType = { kind: "global", name: start };
    } else if (start.startsWith('"') || start.startsWith("'") || start.startsWith("[[")) {
        // String literal
        currentType = { kind: "primitive", name: "string" };
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
        else if (currentType.kind === "table" && currentType.fields) {
            currentType = currentType.fields.get(member) || null;
        }
        else {
            return null;
        }
    }

    return currentType;
}

export function createLuaCompletionSource(options: LuaCompletionOptions = {}) {
    const { hookName, previousScriptCode, scriptOutputs } = options;

    // Pre-compute previous script schema if available
    const prevSchema = previousScriptCode ? extractReturnSchema(previousScriptCode) : null;

    return function luaCompletionSource(context: CompletionContext): CompletionResult | null {
        // Don't trigger on empty
        if (context.pos === 0) return null;

        const code = context.state.doc.toString();
        const line = context.state.doc.lineAt(context.pos);
        const textBefore = line.text.slice(0, context.pos - line.from);

        // Parsing hack: The parser fails on syntactically invalid code (e.g. incomplete statements),
        // causing getVariablesInScope to return nothing. We attempt to "repair" the code
        // by turning incomplete expressions into valid statements (assignments or calls).
        let codeToParse = code;
        const isStatementStart = /^\s*[\w\.:]+$/.test(textBefore) && !/^\s*(local|function|return|break|goto|do|while|repeat|if|for)\b/.test(textBefore);

        if (textBefore.endsWith(".")) {
            // "obj." -> "obj.placeholder = 0" (if start of statement) or "obj.placeholder"
            codeToParse = code.slice(0, context.pos) + "placeholder" + (isStatementStart ? " = 0" : "") + code.slice(context.pos);
        } else if (textBefore.endsWith(":")) {
            // "obj:" -> "obj:placeholder()"
            codeToParse = code.slice(0, context.pos) + "placeholder()" + code.slice(context.pos);
        } else if (isStatementStart) {
            // "abc" (start of line) -> "abc = 0"
            // This ensures "abcdf" parses as an assignment, preserving the AST for the rest of variable discovery.
            codeToParse = code.slice(0, context.pos) + " = 0" + code.slice(context.pos);
        }

        // Infer variable types from current code
        const variables = getVariablesInScope(codeToParse, context.pos);

        // -------------------------------------------------------------------------
        // 1. Chain Completion (local.field.subfield...)
        // -------------------------------------------------------------------------

        // Match a chain of identifiers ending with a dot/colon or partial identifier
        // e.g. "context.user." or "myTable.field" or "object:method" or '"str":'
        const chainMatch = textBefore.match(/((?:[a-zA-Z_]\w*|"[^"]*"|'[^']*')(?:\.|:)(?:[a-zA-Z_]\w*(?:\.|:))*)?([a-zA-Z_]\w*)?$/);

        if (chainMatch) {
            // Group 1: The chain prefix (e.g. "obj." or "obj:"), or undefined if just a word
            // Group 2: The partial word (e.g. "meth"), or undefined if ending in delimiter

            const fullChainPrefix = chainMatch[1] || "";
            const partialWord = chainMatch[2] || "";

            const isDotOrColonCompletion = fullChainPrefix.length > 0;

            // If just typing a word (no dot/colon prefix), handle as global/local completion later
            if (!isDotOrColonCompletion) {
                // Fall through to generic word completion
            } else {
                // Split by . or : to get parts. Warning: String literals might contain dots/colons.
                // Simple split won't work for strings.
                // Robust split: split by . or : but respect quotes?
                // For simplified fix, let's assume standard identifier chains first, 
                // and special case the string literal at the start.

                // Let's rely on resolveLuaType to handle the array. 
                // We need to parse the chain string into parts.
                // Regex to split by . or :
                const parts = fullChainPrefix.split(/[:.]/).filter(p => p.length > 0);

                // Check if the first part is a string literal (rudimentary check)
                // If fullChainPrefix starts with quote, the first part is the string.
                if (fullChainPrefix.startsWith('"') || fullChainPrefix.startsWith("'")) {
                    // Find closing quote
                    const quote = fullChainPrefix[0];
                    const closeIndex = fullChainPrefix.indexOf(quote, 1);
                    if (closeIndex !== -1) {
                        parts[0] = fullChainPrefix.slice(0, closeIndex + 1);
                        // The rest are properties
                        const rest = fullChainPrefix.slice(closeIndex + 2).split(/[:.]/).filter(p => p.length > 0);
                        parts.splice(1, parts.length - 1, ...rest);
                    }
                }

                // If chain is empty (e.g. typing "word"), skip
                if (parts.length > 0) {
                    const resolvedType = resolveLuaType(parts, variables);

                    if (resolvedType) {
                        let completions: Completion[] = [];

                        if (resolvedType.kind === "context" && resolvedType.contextObject) {
                            const ctxObj = resolvedType.contextObject;
                            const typeMap: Record<string, string> = {
                                user: "PipelineUser",
                                session: "PipelineSession",
                                apikey: "PipelineApiKey",
                                client: "OAuthClient",
                                request: "RequestInfo",
                            };
                            const typeName = typeMap[ctxObj];
                            if (typeName) {
                                completions = getNestedObjectCompletions(typeName);
                            }
                        } else if (resolvedType.kind === "global") {
                            if (resolvedType.name === "context") completions = getContextCompletions(hookName);
                            else if (resolvedType.name === "helpers") completions = getHelperCompletions();
                            else if (resolvedType.name === "prev") completions = getPrevCompletions(prevSchema);
                            else if (resolvedType.name === "prev") completions = getPrevCompletions(prevSchema);
                            else if (resolvedType.name && ["string", "math", "table"].includes(resolvedType.name)) {
                                completions = getBuiltinLibraryCompletions(resolvedType.name);
                            }
                        } else if (resolvedType.kind === "primitive" && resolvedType.name === "string") {
                            // String methods
                            completions = getBuiltinLibraryCompletions("string");
                        } else if (resolvedType.kind === "table" && resolvedType.fields) {
                            completions = Array.from(resolvedType.fields.keys()).map((field: string) => ({
                                label: field,
                                type: "property",
                                detail: "table field",
                                boost: 8,
                            }));
                        }

                        if (completions.length > 0) {
                            return {
                                from: context.pos - partialWord.length,
                                options: completions,
                                validFor: /^\w*$/,
                            };
                        }
                    }
                }
            }
        }

        // -------------------------------------------------------------------------
        // 2. Specialized Access (Context, Output Arrays)
        // -------------------------------------------------------------------------

        // Check for context.outputs["xxx"].yyy (Dynamic Script Outputs)
        const outputsWithIdMatch = textBefore.match(/context\.outputs\["([\w-]+)"\]\.(\w*)$/);
        if (outputsWithIdMatch && scriptOutputs) {
            const [, scriptId, partial] = outputsWithIdMatch;
            const schema = scriptOutputs.get(scriptId);
            if (schema) {
                return {
                    from: context.pos - partial.length,
                    options: [
                        ...schema.fields.map((field) => ({
                            label: field,
                            type: "property" as const,
                            detail: `from script "${scriptId}"`,
                            boost: 10,
                        })),
                    ],
                    validFor: /^\w*$/,
                };
            }
        }

        // Check for context.outputs["xxx"].data.yyy
        const outputsDataMatch = textBefore.match(/context\.outputs\["([\w-]+)"\]\.data\.(\w*)$/);
        if (outputsDataMatch && scriptOutputs) {
            const [, scriptId, partial] = outputsDataMatch;
            const schema = scriptOutputs.get(scriptId);
            if (schema?.dataFields) {
                return {
                    from: context.pos - partial.length,
                    options: schema.dataFields.map((field) => ({
                        label: field,
                        type: "property" as const,
                        detail: `data from "${scriptId}"`,
                        boost: 10,
                    })),
                    validFor: /^\w*$/,
                };
            }
        }

        // Fallback: generic outputs completions for context.outputs[...]
        const outputsMatch = textBefore.match(/context\.outputs\[?"?[\w-]*"?\]?\.(\w*)$/);
        if (outputsMatch) {
            return {
                from: context.pos - outputsMatch[1].length,
                options: [
                    { label: "allowed", type: "property", detail: "boolean", info: "Whether the script allowed the action", boost: 10 },
                    { label: "data", type: "property", detail: "table", info: "Data returned by the script", boost: 9 },
                    { label: "error", type: "property", detail: "string?", info: "Error message if blocked", boost: 8 },
                ],
                validFor: /^\w*$/,
            };
        }

        // -------------------------------------------------------------------------
        // 3. Global/Local Word Completion
        // -------------------------------------------------------------------------

        const wordMatch = textBefore.match(/(\w+)$/);
        if (wordMatch || context.explicit) {
            const word = wordMatch ? wordMatch[1] : "";

            // If we are typing a dot logic fell through, don't show globals
            if (textBefore.trim().endsWith(".")) return null;

            const allCompletions: Completion[] = [];

            // Add local variables FIRST with highest priority
            for (const [name, info] of variables) {
                const type = info.inferredType;
                let detail = "local";

                if (type.kind === "context" && type.contextObject) detail = `context.${type.contextObject}`;
                else if (type.kind === "global") detail = type.name || "global";
                else if (type.kind === "primitive") detail = type.name || "local";
                else if (type.kind === "table") detail = "table";
                else if (type.kind === "function") detail = "function";

                let infoFn: (() => HTMLElement) | undefined;
                let apply: Completion["apply"] | undefined;

                if (type.kind === "function") {
                    const params = (type.params || []).map(p => p.name || "arg");
                    detail = `function(${params.join(", ")})`;

                    // Create snippet string: name(${1:param1}, ${2:param2})
                    const snippetArgs = params.map((p, i) => `\${${i + 1}:${p}}`).join(", ");
                    const snippetText = `${name}(${snippetArgs})`;
                    apply = snippet(snippetText);

                    if (info.doc) {
                        infoFn = () => {
                            const div = document.createElement("div");
                            div.className = "cm-completion-info-lua";
                            div.innerHTML = `
                                <div style="font-weight: 600; margin-bottom: 4px;">${name}(${params.join(", ")})</div>
                                <div style="margin-bottom: 8px;">${info.doc!.description || ""}</div>
                            `;
                            return div;
                        };
                    }
                }

                allCompletions.push({
                    label: name,
                    type: type.kind === "function" ? "function" : "variable",
                    detail,
                    info: infoFn,
                    apply,
                    boost: 15, // Higher than everything else
                });
            }

            // Add globals and builtins
            allCompletions.push(
                { label: "helpers", type: "variable", detail: "Pipeline helpers API", boost: 10 },
                { label: "context", type: "variable", detail: "Hook context object", boost: 10 },
                ...getKeywordCompletions(),
                ...getBuiltinCompletions(),
                ...getSnippetCompletions(),
            );

            // Filter if word exists
            const filtered = word.length > 0
                ? allCompletions.filter((c) => c.label.toLowerCase().startsWith(word.toLowerCase()))
                : allCompletions;

            if (filtered.length === 0) return null;

            return {
                from: context.pos - word.length,
                options: filtered,
                validFor: /^\w*$/,
            };
        }

        return null;
    };
}

// =============================================================================
// HELPER: Get context.prev completions with dynamic schema
// =============================================================================

function getPrevCompletions(prevSchema: ReturnType<typeof extractReturnSchema>): Completion[] {
    const completions: Completion[] = [
        { label: "allowed", type: "property", detail: "boolean", info: "Whether previous script allowed the action", boost: 10 },
        { label: "data", type: "property", detail: "table", info: "Data returned by previous script", boost: 9 },
        { label: "error", type: "property", detail: "string?", info: "Error message if blocked", boost: 8 },
    ];

    // Add dynamic fields from previous script return
    if (prevSchema) {
        for (const field of prevSchema.fields) {
            if (!["allowed", "data", "error"].includes(field)) {
                completions.push({
                    label: field,
                    type: "property",
                    detail: "from previous script",
                    boost: 7,
                });
            }
        }
    }

    return completions;
}
