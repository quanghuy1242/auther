// =============================================================================
// LUA AUTOCOMPLETE SOURCES
// =============================================================================
// Custom completion sources for helpers.*, context.*, Lua keywords, and snippets

import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import {
    HELPERS_DEFINITIONS,
    CONTEXT_FIELDS_UNIVERSAL,
    CONTEXT_FIELDS_BY_HOOK,
    LUA_KEYWORDS,
    LUA_BUILTINS,
    SNIPPET_TEMPLATES,
    NESTED_TYPE_FIELDS,
    type HelperDefinition,
    type ContextField,
} from "./definitions";
import { inferVariableTypes, extractReturnSchema, type ReturnSchema } from "./type-inference";

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

        // Infer variable types from current code
        const { variables } = inferVariableTypes(code);

        // Check for local variable member access (e.g., u.xxx where u = context.user)
        const localVarMatch = textBefore.match(/(\w+)\.(\w*)$/);
        if (localVarMatch) {
            const [, varName, partial] = localVarMatch;
            const varInfo = variables.get(varName);

            if (varInfo) {
                let completions: Completion[] = [];

                // Handle different variable types
                if (varInfo.type === "context") {
                    completions = getContextCompletions(hookName);
                } else if (varInfo.type === "nestedContext" && varInfo.contextObject) {
                    const typeMap: Record<string, string> = {
                        user: "PipelineUser",
                        session: "PipelineSession",
                        apikey: "PipelineApiKey",
                        client: "OAuthClient",
                        request: "RequestInfo",
                    };
                    const typeName = typeMap[varInfo.contextObject];
                    if (typeName) {
                        completions = getNestedObjectCompletions(typeName);
                    }
                } else if (varInfo.type === "helpers") {
                    completions = getHelperCompletions();
                } else if (varInfo.type === "table" && varInfo.tableFields) {
                    completions = varInfo.tableFields.map((field) => ({
                        label: field,
                        type: "property",
                        detail: "table field",
                        boost: 8,
                    }));
                } else if (varInfo.type === "prev") {
                    // Use dynamic schema if available
                    completions = getPrevCompletions(prevSchema);
                }

                if (completions.length > 0) {
                    return {
                        from: context.pos - partial.length,
                        options: completions,
                        validFor: /^\w*$/,
                    };
                }
            }
        }

        // Check for helpers.xxx
        const helpersMatch = textBefore.match(/helpers\.(\w*)$/);
        if (helpersMatch) {
            return {
                from: context.pos - helpersMatch[1].length,
                options: getHelperCompletions(),
                validFor: /^\w*$/,
            };
        }

        // Check for context.user.xxx, context.request.xxx, etc.
        const nestedContextMatch = textBefore.match(/context\.(user|session|apikey|client|request)\.(\w*)$/);
        if (nestedContextMatch) {
            const [, objectName, partial] = nestedContextMatch;
            const typeMap: Record<string, string> = {
                user: "PipelineUser",
                session: "PipelineSession",
                apikey: "PipelineApiKey",
                client: "OAuthClient",
                request: "RequestInfo",
            };
            const typeName = typeMap[objectName];
            if (typeName) {
                return {
                    from: context.pos - partial.length,
                    options: getNestedObjectCompletions(typeName),
                    validFor: /^\w*$/,
                };
            }
        }

        // Check for context.prev.xxx - show available fields from previous script
        const prevMatch = textBefore.match(/context\.prev\.(\w*)$/);
        if (prevMatch) {
            return {
                from: context.pos - prevMatch[1].length,
                options: getPrevCompletions(prevSchema),
                validFor: /^\w*$/,
            };
        }

        // Check for context.prev.data.xxx - show data fields from previous script
        const prevDataMatch = textBefore.match(/context\.prev\.data\.(\w*)$/);
        if (prevDataMatch && prevSchema?.dataFields) {
            return {
                from: context.pos - prevDataMatch[1].length,
                options: prevSchema.dataFields.map((field) => ({
                    label: field,
                    type: "property",
                    detail: "from previous script",
                    boost: 10,
                })),
                validFor: /^\w*$/,
            };
        }

        // Check for context.outputs["xxx"].yyy or context.outputs.xxx.yyy
        // Try to match specific script ID for dynamic completions
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

        // Fallback: generic outputs completions
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

        // Check for context.xxx
        const contextMatch = textBefore.match(/context\.(\w*)$/);
        if (contextMatch) {
            return {
                from: context.pos - contextMatch[1].length,
                options: getContextCompletions(hookName),
                validFor: /^\w*$/,
            };
        }

        // Check for general word completion
        const wordMatch = textBefore.match(/(\w+)$/);
        if (wordMatch && wordMatch[1].length >= 2) {
            const word = wordMatch[1];

            // Build all available completions including local variables
            const allCompletions: Completion[] = [];

            // Add local variables FIRST with highest priority
            for (const [name, info] of variables) {
                const typeLabels: Record<string, string> = {
                    context: "context",
                    helpers: "helpers",
                    nestedContext: `context.${info.contextObject}`,
                    table: "table",
                    prev: "context.prev",
                    outputs: "context.outputs",
                    unknown: "local",
                };
                allCompletions.push({
                    label: name,
                    type: "variable",
                    detail: typeLabels[info.type] || "local",
                    boost: 15, // Higher than everything else
                });
            }

            // Add globals and builtins
            allCompletions.push(
                { label: "helpers", type: "variable", detail: "Pipeline helpers API", boost: 10 },
                { label: "context", type: "variable", detail: "Hook context object", boost: 10 },
                { label: "return", type: "keyword", boost: 5 },
                ...getKeywordCompletions(),
                ...getBuiltinCompletions(),
                ...getSnippetCompletions(),
            );

            // Filter by prefix (case-insensitive)
            const filtered = allCompletions.filter((c) => c.label.toLowerCase().startsWith(word.toLowerCase()));

            if (filtered.length === 0) return null;

            return {
                from: context.pos - word.length,
                options: filtered,
                validFor: /^\w*$/,
            };
        }

        // Explicit activation (Ctrl+Space) - also check for partial word
        if (context.explicit) {
            // Check if there's a partial word being typed
            const partialWord = textBefore.match(/(\w*)$/)?.[1] || "";

            // Build all completions with local variables first
            const allCompletions: Completion[] = [];

            // Add local variables with high priority
            for (const [name, info] of variables) {
                const typeLabels: Record<string, string> = {
                    context: "context",
                    helpers: "helpers",
                    nestedContext: `context.${info.contextObject}`,
                    table: "table",
                    prev: "context.prev",
                    outputs: "context.outputs",
                    unknown: "local",
                };
                allCompletions.push({
                    label: name,
                    type: "variable",
                    detail: typeLabels[info.type] || "local",
                    boost: 15,
                });
            }

            // Add globals and keywords
            allCompletions.push(
                { label: "helpers", type: "variable", detail: "Pipeline helpers API", boost: 10 },
                { label: "context", type: "variable", detail: "Hook context object", boost: 10 },
                ...getKeywordCompletions(),
                ...getSnippetCompletions(),
            );

            // Filter by partial word if any
            const filtered = partialWord.length > 0
                ? allCompletions.filter((c) => c.label.toLowerCase().startsWith(partialWord.toLowerCase()))
                : allCompletions;

            return {
                from: context.pos - partialWord.length,
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
