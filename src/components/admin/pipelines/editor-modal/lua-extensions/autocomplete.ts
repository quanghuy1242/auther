// =============================================================================
// LUA AUTOCOMPLETE SOURCES
// =============================================================================
// Custom completion sources for helpers.*, context.*, Lua keywords, and snippets

import { type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
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
import {
    resolveNodeAtPosition,
    inferExpressionType,
    extractReturnSchema,
    type ReturnSchema,
    type VariableType,
}
    from "./type-inference";

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
// HELPERS
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
        // Don't trigger on empty (unless explicit?)
        if (context.pos === 0 && !context.explicit) return null;

        const code = context.state.doc.toString();
        const line = context.state.doc.lineAt(context.pos);
        const textBefore = line.text.slice(0, context.pos - line.from);

        // ---------------------------------------------------------------------
        // 1. Repair Code (for AST parsing)
        // ---------------------------------------------------------------------
        let codeToParse = code;
        const isStatementStart = /^\s*[\w\.:]+$/.test(textBefore) && !/^\s*(local|function|return|break|goto|do|while|repeat|if|for)\b/.test(textBefore);
        const isWhitespace = /^\s*$/.test(textBefore);

        let placeholderPos = context.pos; // Where we will infer type at

        if (textBefore.endsWith(".")) {
            // "obj." -> "obj.placeholder = 0" 
            // placeholderInserted = true;
            // Insert placeholder "placeholder"
            const insertion = "placeholder" + (isStatementStart ? " = 0" : "");
            codeToParse = code.slice(0, context.pos) + insertion + code.slice(context.pos);
            // We want to resolve the inserted placeholder
            // 'placeholder' is 11 chars. We want the position of 'placeholder' start.
            // Wait, resolveNodeAtPosition expects position of the node.
            // If we insert "placeholder", the node starts at context.pos.
            // So resolving at context.pos should work as it hits the identifier.
            placeholderPos = context.pos + 1; // +1 to be safely inside
        } else if (textBefore.endsWith(":")) {
            // "obj:" -> "obj:placeholder()"
            // placeholderInserted = true;
            const insertion = "placeholder()";
            codeToParse = code.slice(0, context.pos) + insertion + code.slice(context.pos);
            placeholderPos = context.pos + 1;
        } else if (isStatementStart) {
            // "abc" -> "abc = 0" (if just a word at start of statement)
            const insertion = " = 0";
            codeToParse = code.slice(0, context.pos) + insertion + code.slice(context.pos);
        } else if (isWhitespace) {
            // Empty document or new line start -> treat as explicit request for globals
            const insertion = "placeholder = 0";
            codeToParse = code.slice(0, context.pos) + insertion + code.slice(context.pos);
            placeholderPos = context.pos + 1;
        }

        // ---------------------------------------------------------------------
        // 2. Resolve AST
        // ---------------------------------------------------------------------

        // Use resolveNodeAtPosition to find what we are looking at.
        const resolved = resolveNodeAtPosition(codeToParse, placeholderPos);

        if (!resolved) {
            // Fallback
            return null;
        }

        const { node, path, scope } = resolved;

        // ---------------------------------------------------------------------
        // 3. Determine Context based on Node
        // ---------------------------------------------------------------------

        // Case A: Property Access (MemberExpression)
        if (node.type === "Identifier") {
            const parent = path[path.length - 2];

            // Check if we are the Property (right side) of a MemberExpression
            if (parent && (parent.type === "MemberExpression" || parent.type === "TableKeyString") && parent.identifier === node) {
                // We are completing a property.
                // Resolve the BASE.
                const baseType = inferExpressionType(parent.base, scope);

                let completions: Completion[] = [];

                if (baseType.kind === "context" && baseType.contextObject) {
                    // context.[nested].*
                    const typeMap: Record<string, string> = {
                        user: "PipelineUser",
                        session: "PipelineSession",
                        apikey: "PipelineApiKey",
                        client: "OAuthClient",
                        request: "RequestInfo",
                    };
                    const typeName = typeMap[baseType.contextObject];
                    if (typeName) completions = getNestedObjectCompletions(typeName);

                } else if (baseType.kind === "global") {
                    // context.* or helpers.*
                    if (baseType.name === "context") completions = getContextCompletions(hookName);
                    else if (baseType.name === "helpers") completions = getHelperCompletions();
                    else if (baseType.name === "prev") completions = getPrevCompletions(prevSchema);
                    else if (baseType.name === "outputs") {
                        // Fallback/Generic outputs
                        completions = [
                            { label: "allowed", type: "property", detail: "boolean", info: "Whether script allowed", boost: 10 },
                            { label: "data", type: "property", detail: "table", info: "Script data", boost: 9 },
                            { label: "error", type: "property", detail: "string?", info: "Error message", boost: 8 },
                        ];
                    }
                    else if (baseType.name && ["string", "math", "table"].includes(baseType.name)) {
                        completions = getBuiltinLibraryCompletions(baseType.name);
                    }
                } else if (baseType.kind === "primitive" && baseType.name === "string") {
                    completions = getBuiltinLibraryCompletions("string");
                } else if (baseType.kind === "table" && baseType.fields) {
                    completions = Array.from(baseType.fields.keys()).map((field: string) => ({
                        label: field,
                        type: "property",
                        detail: "table field",
                        boost: 8,
                    }));
                }

                if (completions.length > 0) {
                    // Match against word being typed
                    const wordMatch = textBefore.match(/(\w*)$/);
                    const partialWord = wordMatch ? wordMatch[1] : "";

                    // Filter completions
                    const filtered = partialWord.length > 0
                        ? completions.filter(c => c.label.toLowerCase().startsWith(partialWord.toLowerCase()))
                        : completions;

                    if (filtered.length > 0) {
                        return {
                            from: context.pos - partialWord.length,
                            options: filtered,
                            validFor: /^\w*$/,
                        };
                    }
                }
            }

            // Case B: Variable/Global Completion
            const isMemberProperty = parent && (parent.type === "MemberExpression" || parent.type === "TableKeyString") && parent.identifier === node;

            if (!isMemberProperty && !textBefore.endsWith(".")) {
                // Regular variable completion

                const wordMatch = textBefore.match(/(\w*)$/);
                const word = wordMatch ? wordMatch[1] : "";

                const allCompletions: Completion[] = [];

                // Locals - Walk up scope
                const variables = new Map<string, VariableType>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let currentScope: any = scope; // Simplify type checking for linked list
                while (currentScope) {
                    if (currentScope.variables) {
                        for (const [k, v] of currentScope.variables) {
                            if (!variables.has(k)) variables.set(k, v);
                        }
                    }
                    currentScope = currentScope.parent;
                }

                for (const [name, info] of variables) {
                    const type = info.inferredType;
                    let detail = "local";
                    if (type.kind === "context" && type.contextObject) detail = `context.${type.contextObject}`;
                    else if (type.kind === "global") detail = type.name || "global";
                    else if (type.kind === "primitive") detail = type.name || "local";
                    else if (type.kind === "table") detail = "table";
                    else if (type.kind === "function") detail = "function";

                    allCompletions.push({
                        label: name,
                        type: type.kind === "function" ? "function" : "variable",
                        detail,
                        boost: 15
                    });
                }

                // Globals
                allCompletions.push(
                    { label: "helpers", type: "variable", detail: "Pipeline helpers API", boost: 10 },
                    { label: "context", type: "variable", detail: "Hook context object", boost: 10 },
                    ...getKeywordCompletions(),
                    ...getBuiltinCompletions(),
                    ...getSnippetCompletions(),
                );

                const filtered = word.length > 0
                    ? allCompletions.filter(c => c.label.toLowerCase().startsWith(word.toLowerCase()))
                    : allCompletions;

                if (filtered.length > 0) {
                    return {
                        from: context.pos - word.length,
                        options: filtered,
                        validFor: /^\w*$/,
                    };
                }
            }
        }

        // ---------------------------------------------------------------------
        // 4. Fallback: Dynamic Outputs (AST based)
        // ---------------------------------------------------------------------
        // context.outputs["xxx"].yyy or context.outputs["xxx"].data.yyy

        if (scriptOutputs && node.type === "Identifier") {
            const parent = path[path.length - 2];
            // Check if we are a property of usage
            if (parent && (parent.type === "MemberExpression" || parent.type === "TableKeyString") && parent.identifier === node) {
                // Check base: context.outputs["xxx"] or context.outputs["xxx"].data
                const base = parent.base;

                // Helper to check for context.outputs["id"]
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const getOutputScriptId = (n: any): string | null => {
                    // Expecting IndexExpression: base=MemberExpr(context.outputs), index=StringLiteral
                    if (n.type === "IndexExpression" && n.index.type === "StringLiteral") {
                        const innerBase = n.base;
                        if (innerBase.type === "MemberExpression" &&
                            innerBase.identifier.name === "outputs" &&
                            innerBase.base.type === "Identifier" && innerBase.base.name === "context") {
                            return n.index.value;
                        }
                    }
                    return null;
                };

                // Case 1: context.outputs["id"].FIELD
                const scriptId1 = getOutputScriptId(base);
                if (scriptId1) {
                    const schema = scriptOutputs.get(scriptId1);
                    if (schema) {
                        return {
                            from: context.pos - textBefore.match(/(\w*)$/)![1].length,
                            options: schema.fields.map(field => ({
                                label: field,
                                type: "property",
                                detail: `from script "${scriptId1}"`,
                                boost: 10,
                            })),
                            validFor: /^\w*$/,
                        };
                    }
                }

                // Case 2: context.outputs["id"].data.FIELD
                // base is "context.outputs["id"].data" (MemberExpression)
                if (base.type === "MemberExpression" && base.identifier.name === "data") {
                    const scriptId2 = getOutputScriptId(base.base);
                    if (scriptId2) {
                        const schema = scriptOutputs.get(scriptId2);
                        if (schema?.dataFields) {
                            return {
                                from: context.pos - textBefore.match(/(\w*)$/)![1].length,
                                options: schema.dataFields.map(field => ({
                                    label: field,
                                    type: "property",
                                    detail: `data from "${scriptId2}"`,
                                    boost: 10,
                                })),
                                validFor: /^\w*$/,
                            };
                        }
                    }
                }
            }
        }

        return null;
    };
}
