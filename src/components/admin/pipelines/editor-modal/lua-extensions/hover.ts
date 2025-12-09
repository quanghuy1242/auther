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
import {
    resolveNodeAtPosition, formatLuaType, inferExpressionType,
} from "./type-inference";

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

function createContextFieldTooltip(field: ContextField, prefix: string = "context"): HTMLElement {
    return createTooltipDOM(`
        <div style="font-weight: 600; font-family: monospace; margin-bottom: 4px;">
            <span style="color: #e5c07b;">${prefix}.${field.name}</span>
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

function createVariableTooltip(name: string, variable: ResolveResult["type"], doc?: { description?: string; params?: { name: string; type: string; description: string }[]; returns?: { type: string; description: string } }, initLine?: number, isUpvalue?: boolean): HTMLElement {
    let signature = name;
    signature = `${name}: ${formatLuaType(variable)}`;

    return createTooltipDOM(`
        <div style="font-weight: 600; font-family: monospace; color: #61afef; margin-bottom: 6px; white-space: pre-wrap;">${signature}</div>
        ${isUpvalue ? '<div style="color: #abb2bf; font-style: italic; margin-bottom: 4px; font-size: 0.9em;">Upvalue from outer scope</div>' : ""}
        <div style="margin-bottom: 8px;">${doc?.description || ""}</div>
        ${doc?.params?.length ? `
        <div style="font-size: 0.9em; opacity: 0.8;">
            <div style="font-weight: 500; margin-bottom: 4px;">Parameters:</div>
            ${doc.params.map((p: { name: string; type: string; description: string }) => `
                <div style="margin-left: 8px;">
                    <code style="color: #e5c07b;">${p.name}</code>: <span style="color: #98c379;">${p.type}</span>
                    <span style="opacity: 0.7;"> — ${p.description}</span>
                </div>
            `).join("")}
        </div>
        ` : ""}
        ${doc?.returns ? `
        <div style="font-size: 0.9em; margin-top: 6px;">
            <span style="font-weight: 500;">Returns:</span> 
            <code style="color: #98c379;">${doc.returns.type}</code>
            <span style="opacity: 0.7;"> — ${doc.returns.description}</span>
        </div>
        ` : ""}
        ${initLine ? `
            <div style="font-size: 0.8em; margin-top: 8px; opacity: 0.6; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
                Defined on line ${initLine}
            </div>
        ` : ""}
    `);
}

// =============================================================================
// HOVER PROVIDER
// =============================================================================

export interface LuaHoverOptions {
    hookName?: string;
}

type ResolveResult = NonNullable<ReturnType<typeof resolveNodeAtPosition>>;

export function createLuaHoverTooltip(options: LuaHoverOptions = {}) {
    const { hookName } = options;

    return hoverTooltip((view: EditorView, pos: number): Tooltip | null => {
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
        const col = pos - line.from;

        // 1. Identify word under cursor (for keywords and fallback)
        let wordStart = col;
        let wordEnd = col;
        while (wordStart > 0 && /\w/.test(text[wordStart - 1])) wordStart--;
        while (wordEnd < text.length && /\w/.test(text[wordEnd])) wordEnd++;
        const word = text.slice(wordStart, wordEnd);

        if (!word) return null;

        // Check keywords
        if ((LUA_KEYWORDS as readonly string[]).includes(word)) {
            return {
                pos: line.from + wordStart,
                above: true,
                create: () => ({ dom: createKeywordTooltip(word) }),
            };
        }

        // 2. Resolve AST
        const resolved = resolveNodeAtPosition(view.state.doc.toString(), pos);
        if (!resolved) return null;

        const { type, node, path, scope } = resolved;
        const startPos = (node.range ? node.range[0] : line.from + wordStart);

        // --- Helper Function ---
        if (type.kind === "helper" && type.helperName) {
            const def = HELPERS_DEFINITIONS.find(h => h.name === type.helperName);
            if (def) {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({ dom: createHelperTooltip(def) }),
                };
            }
        }

        // --- Context Object (e.g. "context", "context.user") ---
        if (type.kind === "context" && type.contextObject) {
            const ctxObj = type.contextObject;
            // e.g. "user"
            // Show summary of context.user?
            // "PipelineUser"
            return {
                pos: startPos,
                above: true,
                create: () => ({
                    dom: createTooltipDOM(`
                        <div style="font-weight: 600; color: #e5c07b; margin-bottom: 4px;">context.${ctxObj}</div>
                        <div>Context object: ${ctxObj}</div>
                     `)
                })
            };
        }

        // --- Global Objects (context, helpers, builtins) ---
        if (type.kind === "global") {
            if (type.name === "context") {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({
                        dom: createTooltipDOM(`
                            <div style="font-weight: 600; color: #e5c07b; margin-bottom: 4px;">context</div>
                            <div>Hook-specific context object.</div>
                        `)
                    })
                };
            }
            if (type.name === "helpers") {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({
                        dom: createTooltipDOM(`
                            <div style="font-weight: 600; color: #61afef; margin-bottom: 4px;">helpers</div>
                            <div>Pipeline helper functions.</div>
                        `)
                    })
                };
            }
            if (type.name === "prev") {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({
                        dom: createTooltipDOM(`
                            <div style="font-weight: 600; color: #e5c07b; margin-bottom: 4px;">context.prev</div>
                            <div>Previous script output.</div>
                        `)
                    })
                };
            }
            if (type.name === "outputs") {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({
                        dom: createTooltipDOM(`
                            <div style="font-weight: 600; color: #e5c07b; margin-bottom: 4px;">context.outputs</div>
                            <div>All previous script outputs.</div>
                        `)
                    })
                };
            }
            // Builtins and disabled globals
            if (type.name && (DISABLED_GLOBALS as readonly string[]).includes(type.name)) {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({ dom: createDisabledGlobalTooltip(type.name!) }),
                };
            }
            if (LUA_BUILTIN_DOCS[type.name!]) {
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({ dom: createBuiltinTooltip(type.name!, LUA_BUILTIN_DOCS[type.name!]) }),
                };
            }
        }

        // --- Built-in Functions (detected as functions) ---
        if (type.kind === "function" && type.name && LUA_BUILTIN_DOCS[type.name]) {
            return {
                pos: startPos,
                above: true,
                create: () => ({ dom: createBuiltinTooltip(type.name!, LUA_BUILTIN_DOCS[type.name!]) }),
            };
        }

        if (node.type === "Identifier") {
            const parent = path[path.length - 2];
            if (parent && parent.type === "MemberExpression" && parent.identifier === node) {
                const baseType = inferExpressionType(parent.base, scope);

                // Case 1: context.user.email (base is context object)
                if (baseType.kind === "context" && baseType.contextObject) {
                    const typeMap: Record<string, string> = {
                        user: "PipelineUser",
                        session: "PipelineSession",
                        apikey: "PipelineApiKey",
                        client: "OAuthClient",
                        request: "RequestInfo",
                    };
                    const typeName = typeMap[baseType.contextObject];
                    if (typeName) {
                        const fields = NESTED_TYPE_FIELDS[typeName];
                        const field = fields?.find((f) => f.name === node.name);
                        if (field) {
                            return {
                                pos: startPos,
                                above: true,
                                create: () => ({
                                    dom: createTooltipDOM(`
                                <div style="font-weight: 600; font-family: monospace; margin-bottom: 4px;">
                                    <span style="color: #e5c07b;">context.${baseType.contextObject}.${field.name}</span>
                                    <span style="opacity: 0.7;">: ${field.type}</span>
                                </div>
                                <div>${field.description}</div>
                                `),
                                }),
                            };
                        }
                    }
                }

                // Case 2: context.email (base is context global)
                if (baseType.kind === "global" && baseType.name === "context") {
                    const fieldName = node.name;
                    // Check universal fields
                    let field = CONTEXT_FIELDS_UNIVERSAL.find((f) => f.name === fieldName);
                    // Check hook-specific fields
                    if (!field && hookName && CONTEXT_FIELDS_BY_HOOK[hookName]) {
                        field = CONTEXT_FIELDS_BY_HOOK[hookName].find((f) => f.name === fieldName);
                    }
                    if (field) {
                        return {
                            pos: startPos,
                            above: true,
                            create: () => ({ dom: createContextFieldTooltip(field) }),
                        };
                    }
                }

                // Case 3: helpers.matches (base is helpers global)
                if (baseType.kind === "global" && baseType.name === "helpers") {
                    const helperName = node.name;
                    const def = HELPERS_DEFINITIONS.find(h => h.name === helperName);
                    if (def) {
                        return {
                            pos: startPos,
                            above: true,
                            create: () => ({ dom: createHelperTooltip(def) }),
                        };
                    }
                }

                // Case 4: string.len, table.insert (base is builtin global)
                if (baseType.kind === "global" && ["string", "math", "table"].includes(baseType.name!)) {
                    const libName = baseType.name!;
                    const funcName = node.name;
                    const key = `${libName}.${funcName}`;
                    if (LUA_BUILTIN_DOCS[key]) {
                        return {
                            pos: startPos,
                            above: true,
                            create: () => ({ dom: createBuiltinTooltip(key, LUA_BUILTIN_DOCS[key]) }),
                        };
                    }
                }
            }
        }

        // --- Fallback: Variable or Property ---
        // If it's a local variable, `type` will be whatever, but we want the docs/declaration info.
        // `scope.get(word)`?
        // If `node` is Identifier, `node.name` is the word.
        if (node.type === "Identifier") {
            const varName = node.name;
            const variable = scope.get(varName);

            // Only show tooltip if it's a variable we know about (local/global in scope)
            // AND not a MemberExpression property (handled above hopefully, or here if generic)

            // If we are a property (parent is MemberExpr, we are identifier), scope.get(name) might return a local var with same name!
            // e.g. `local email = ...; context.user.email`
            // hover `email` in `context.user.email`. `scope.get("email")` returns local var!
            // Matches `context.user.email`? No.
            // So we must check if we are a property.

            const parent = path[path.length - 2];
            const isProperty = parent && (
                (parent.type === "MemberExpression" && parent.identifier === node) ||
                (parent.type === "TableKey" && parent.key === node) ||
                (parent.type === "TableKeyString" && parent.key === node)
            );

            if (!isProperty && variable) {
                // const isUpvalue = variable.kind === "local" && scope !== resolved.scope; // approximate upvalue check (scope diff not exposed well)
                // actually `getVariablesInScope` logic handles upvalue kind.
                // But here we are using `scope.get`.

                return {
                    pos: startPos,
                    above: true,
                    create: () => ({ dom: createVariableTooltip(variable.name, variable.inferredType, variable.doc, variable.line) })
                };
            }

            if (isProperty) {
                // It's a property. Use `type` (inferred type of the expression).
                const typeName = formatLuaType(type);
                return {
                    pos: startPos,
                    above: true,
                    create: () => ({
                        dom: createTooltipDOM(`
                             <div style="font-weight: 600; font-family: monospace; color: #61afef; margin-bottom: 6px;">
                                 (property) ${varName}: ${typeName}
                             </div>
                         `)
                    })
                };
            }
        }


        return null;
    });
}

