import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import * as luaparse from "luaparse";
import { Scope } from "./type-inference";

// =============================================================================
// STYLES & DECORATIONS - VS Code-inspired semantic highlighting
// =============================================================================
// Color palette based on VS Code Dark+ with semantic tokens:
// - Namespace/Module: Teal (#4EC9B0)
// - Method/Function: Light Yellow (#DCDCAA)
// - Property: Light Blue (#9CDCFE)
// - Variable: Sky Blue (#9CDCFE)
// - Parameter: Light Orange (#E8AB6A)
// - Type: Green (#4EC9B0)
// - Keyword: Purple (#C586C0) - handled by syntax highlighting
// - String: Orange (#CE9178) - handled by syntax highlighting

// Globals defined in pipeline (orange, bold)
const globalDecoration = Decoration.mark({
    class: "cm-lua-global",
    attributes: { style: "color: #d19a66 !important; font-weight: 600 !important;" },
});

// Function parameters (light orange, VS Code style)
const parameterDecoration = Decoration.mark({
    class: "cm-lua-parameter",
    attributes: { style: "color: #E8AB6A !important; font-style: italic !important;" },
});

// Upvalues - variables from outer scope (light blue italic)
const upvalueDecoration = Decoration.mark({
    class: "cm-lua-upvalue",
    attributes: { style: "color: #9CDCFE !important; font-style: italic !important;" },
});

// helpers.* METHOD calls - Light Yellow (VS Code function color)
const helperDecoration = Decoration.mark({
    class: "cm-lua-helper",
    attributes: { style: "color: #DCDCAA !important;" }, // Function/method color
});

// helpers BASE object - Teal (VS Code namespace color)
const helpersBaseDecoration = Decoration.mark({
    class: "cm-lua-helpers-base",
    attributes: { style: "color: #4EC9B0 !important; font-weight: 600 !important;" }, // Namespace color
});

// context.* PROPERTY access - Light Blue (VS Code property color)
const contextDecoration = Decoration.mark({
    class: "cm-lua-context",
    attributes: { style: "color: #9CDCFE !important;" }, // Property color
});

// context/prev/outputs BASE object - Teal (VS Code namespace color)
const contextBaseDecoration = Decoration.mark({
    class: "cm-lua-context-base",
    attributes: { style: "color: #4EC9B0 !important; font-weight: 600 !important;" }, // Namespace color
});

// Unknown globals (red wavy underline)
const unknownGlobalDecoration = Decoration.mark({
    class: "cm-lua-unknown-global",
    attributes: { style: "text-decoration: underline wavy #f44747 !important; color: #ce9178 !important;" },
});

// string.* library METHODS - Light Yellow (function color)
const stringLibDecoration = Decoration.mark({
    class: "cm-lua-string-lib",
    attributes: { style: "color: #DCDCAA !important;" }, // Function color
});

// table.* library METHODS - Light Yellow (function color)
const tableLibDecoration = Decoration.mark({
    class: "cm-lua-table-lib",
    attributes: { style: "color: #DCDCAA !important;" }, // Function color
});

// math.* library METHODS - Light Yellow (function color)
const mathLibDecoration = Decoration.mark({
    class: "cm-lua-math-lib",
    attributes: { style: "color: #DCDCAA !important;" }, // Function color
});

// Boolean literals (true/false) - Blue (VS Code keyword-like)
const booleanDecoration = Decoration.mark({
    class: "cm-lua-boolean",
    attributes: { style: "color: #569CD6 !important; font-weight: 500 !important;" },
});

// nil literal - Blue italic
const nilDecoration = Decoration.mark({
    class: "cm-lua-nil",
    attributes: { style: "color: #569CD6 !important; font-style: italic !important;" },
});

// Local variables - Sky Blue (VS Code variable color)
const localVarDecoration = Decoration.mark({
    class: "cm-lua-local",
    attributes: { style: "color: #9CDCFE !important;" },
});

// Builtin functions (pairs, ipairs, etc.) - Light Yellow (function color)
const builtinDecoration = Decoration.mark({
    class: "cm-lua-builtin",
    attributes: { style: "color: #DCDCAA !important;" },
});

// Standard library NAMESPACE bases (string, table, math) - Teal
const libNamespaceDecoration = Decoration.mark({
    class: "cm-lua-lib-namespace",
    attributes: { style: "color: #4EC9B0 !important; font-weight: 600 !important;" },
});

// User-defined function names (local function, function calls) - Light Yellow
const functionDecoration = Decoration.mark({
    class: "cm-lua-function",
    attributes: { style: "color: #DCDCAA !important;" },
});

// Table field access (t.field, t.a.b) - Sky Blue (property access)
const propertyDecoration = Decoration.mark({
    class: "cm-lua-property",
    attributes: { style: "color: #9CDCFE !important;" },
});

// Table key in definition ({ a = 1 }) - Light Blue
const tableKeyDecoration = Decoration.mark({
    class: "cm-lua-table-key",
    attributes: { style: "color: #9CDCFE !important;" },
});

// Goto Labels (::label::) - Yellow/Greenish
const labelDecoration = Decoration.mark({
    class: "cm-lua-label",
    attributes: { style: "color: #B5CEA8 !important; font-weight: bold !important;" }, // VS Code label color
});

// =============================================================================
// AST WALKER FOR HIGHLIGHTING
// =============================================================================

interface LuaNode {
    type: string;
    // This index signature is necessary for luaparse AST nodes which have varying properties.
    // Removing it would require defining a specific interface for every possible node type,
    // which is beyond the scope of this change and would introduce significant complexity.
    [key: string]: unknown;
    loc?: { start: { line: number } };
    range?: [number, number];
    name?: string;
    identifier?: LuaNode;
    isLocal?: boolean;
    parameters?: LuaNode[];
    variables?: LuaNode[];
    base?: LuaNode;
    iterators?: LuaNode[];
    variable?: LuaNode;
}

function walkForHighlighting(
    node: LuaNode,
    scope: Scope,
    pending: PendingDecoration[]
) {
    if (!node) return;

    let scopePushed = false;
    const blockCreatingNodes = ["FunctionDeclaration", "DoStatement", "WhileStatement", "RepeatStatement", "IfStatement", "ForNumericStatement", "ForGenericStatement"];

    // Push scope (reuse Logic from type-inference but simpler)
    if (blockCreatingNodes.includes(node.type)) {
        const range = node.range ? { start: node.range[0], end: node.range[1] } : { start: 0, end: 0 };
        scope = new Scope(range, scope);
        scopePushed = true;
    }

    // --- Definitions ---

    // Function Declaration (Identifier is definition)
    if (node.type === "FunctionDeclaration") {
        if (node.identifier?.type === "Identifier" && node.identifier.name) {
            const name = node.identifier.name;
            const isLocal = node.isLocal;
            const targetScope = isLocal ? (scope.parent || scope) : getRootScope(scope);

            targetScope.add(name, {
                name,
                kind: isLocal ? "function" : "global",
                inferredType: { kind: "function" },
                line: node.identifier.loc?.start.line || 0
            });

            // Highlight the function name definition
            if (isLocal) {
                addDecoration(pending, node.identifier, functionDecoration);
            } else {
                addDecoration(pending, node.identifier, globalDecoration);
            }
        }
        // Handle dotted function definitions: function MyTable.method()
        else if (node.identifier?.type === "MemberExpression") {
            // Traverse the chain to highlight keys
            // For MyTable.method, MyTable is base, method is identifier
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const methodIdentifier = (node.identifier as any).identifier;
            addDecoration(pending, methodIdentifier, functionDecoration);

            // We should also traverse the base to highlight properties
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((node.identifier as any).base) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                walkForHighlighting((node.identifier as any).base, scope, pending);
            }
        }

        // Parameters
        const params = node.parameters || [];
        params.forEach((p: LuaNode) => {
            const pName = p.name || (p as { value?: string }).value; // Identifier or VarargLiteral '...'
            if (typeof pName === "string") {
                scope.add(pName, {
                    name: pName,
                    kind: "parameter",
                    inferredType: { kind: "unknown" },
                    line: node.identifier?.loc?.start.line || 0
                });
                // Highlight param definition
                // (Using p node range)
                addDecoration(pending, p, parameterDecoration);
            }
        });
    }

    // Local Declaration
    if (node.type === "LocalStatement") {
        const vars = node.variables || [];
        vars.forEach((v: LuaNode) => {
            if (v.type === "Identifier" && v.name) {
                scope.add(v.name, {
                    name: v.name,
                    kind: "local",
                    inferredType: { kind: "unknown" },
                    line: v.loc?.start.line || 0
                });
                // Highlight local variable definition the same as usage
                addDecoration(pending, v, localVarDecoration);
            }
        });
    }

    // For Loop Variable
    if (node.type === "ForNumericStatement" && node.variable && node.variable.name) {
        scope.add(node.variable.name, {
            name: node.variable.name,
            kind: "local",
            inferredType: { kind: "primitive", name: "number" },
            line: node.variable.loc?.start.line || 0
        });
        // Highlight definition? Local vars usually standard color.
    }
    if (node.type === "ForGenericStatement" && node.iterators) {
        node.variables!.forEach((v: LuaNode) => {
            if (v.name) {
                scope.add(v.name, {
                    name: v.name,
                    kind: "local",
                    inferredType: { kind: "unknown" },
                    line: v.loc?.start.line || 0
                });
            }
        });
    }


    // --- Usages (Identifiers) ---
    // Scan all children. if child is Identifier and NOT a definition key, highlight it.
    // luaparse structure is tricky. We need to know context.

    // Manually handle children to control context
    if (node.type === "Identifier") {
        // Check if this identifier is being used (read/write)
        // We rely on parent traversal to skip definition nodes if handled above.
        // Actually, simpler traversal: just handle "Identifier" node when strictly as usage.
        // But we lack parent pointer here.

        // Alternative: Traversal handles specific fields.
    }

    // Instead of generic recursion, specific logic per node type is better for precise highlighting
    // But generic recursion is easier to write.
    // Let's stick to generic recursion but skip keys we handled as definitions.

    const defKeys = new Set<string>();
    if (node.type === "FunctionDeclaration") {
        if (node.identifier) defKeys.add("identifier");
        if (node.parameters) defKeys.add("parameters");
    }
    if (node.type === "LocalStatement") defKeys.add("variables");
    if (node.type === "ForNumericStatement") defKeys.add("variable");
    if (node.type === "ForGenericStatement") defKeys.add("variables");
    if (node.type === "TableKeyString") defKeys.add("key"); // Key is string, not identifier usage
    if (node.type === "MemberExpression") defKeys.add("identifier"); // property name

    // Helper to traverse
    const visit = (key: string, child: LuaNode | LuaNode[] | unknown) => {
        if (!child || typeof child !== "object") return;
        if (defKeys.has(key)) return; // Skip definition identifiers (handled or ignored)

        if (!Array.isArray(child)) {
            if ((child as LuaNode).type === "Identifier") {
                highlightIdentifier(child as LuaNode, scope, pending);
            } else {
                walkForHighlighting(child as LuaNode, scope, pending);
            }
        }
    };

    // Iterate keys
    for (const key in node) {
        if (key === "type" || key === "loc" || key === "range") continue;
        const child = node[key];
        if (Array.isArray(child)) {
            child.forEach(c => {
                // For arrays, we don't skip entire array if one element is def?
                // Actually logic matches: defKeys has "variables" -> skip traversing variables array
                if (!defKeys.has(key)) {
                    if (c && typeof c === "object" && (c as LuaNode).type === "Identifier") highlightIdentifier(c as LuaNode, scope, pending);
                    else if (c && typeof c === "object") walkForHighlighting(c as LuaNode, scope, pending);
                } else if (key === "variables" || key === "parameters") {
                    // We already handled them for Scope, but skipped highlighting?
                    // Function params were highlighted.
                    // Local vars not highlighted (default color).
                }
            });
        } else {
            visit(key, child);
        }
    }

    // Special handling for MemberExpression Identifier property
    // e.g. context.user -> 'user' is the identifier property.
    // Logic above skipped it via defKeys.add("identifier").
    // We want to highlight it if it's special.
    if (node.type === "MemberExpression") {
        // node.base is traversed via generic loop
        // node.identifier is skipped.
        // If base is 'context', we might want to highlight identifier.
        const base = node.base;
        if (base?.type === "Identifier") {
            const baseName = base.name;
            // Highlight context and its properties
            if (baseName === "context" || baseName === "prev" || baseName === "outputs") {
                addDecoration(pending, node.identifier!, contextDecoration);
            }
            // Highlight helpers and its methods
            else if (baseName === "helpers") {
                addDecoration(pending, node.identifier!, helperDecoration);
            }
            // Highlight string library methods
            else if (baseName === "string") {
                addDecoration(pending, node.identifier!, stringLibDecoration);
            }
            // Highlight table library methods
            else if (baseName === "table") {
                addDecoration(pending, node.identifier!, tableLibDecoration);
            }
            // Highlight math library methods
            else if (baseName === "math") {
                addDecoration(pending, node.identifier!, mathLibDecoration);
            }
            // For local variable chains (t.a.b), highlight the property
            else {
                addDecoration(pending, node.identifier!, propertyDecoration);
            }
        }
        // For nested chains like t.a.b.c, base is MemberExpression not Identifier
        // In this case, also highlight the identifier as property
        else if (base?.type === "MemberExpression") {
            addDecoration(pending, node.identifier!, propertyDecoration);
        }
    }

    // Highlight boolean literals (true/false)
    if (node.type === "BooleanLiteral") {
        addDecoration(pending, node, booleanDecoration);
    }

    // Highlight nil literal
    if (node.type === "NilLiteral") {
        addDecoration(pending, node, nilDecoration);
    }

    // Highlight table constructor field keys: { a = 1, b = 2 }
    if (node.type === "TableConstructorExpression") {
        const fields = (node as unknown as { fields: LuaNode[] }).fields || [];
        fields.forEach((field: LuaNode) => {
            // TableKeyString has a key property which is the identifier
            if (field.type === "TableKeyString" && (field as unknown as { key: LuaNode }).key) {
                const key = (field as unknown as { key: LuaNode }).key;
                if (key.range) {
                    addDecoration(pending, key, tableKeyDecoration);
                }
            }
        });
    }

    // Goto and Label Statements
    if (node.type === "LabelStatement" && node.label) {
        addDecoration(pending, node.label as unknown as LuaNode, labelDecoration);
    }
    if (node.type === "GotoStatement" && node.label) {
        addDecoration(pending, node.label as unknown as LuaNode, labelDecoration);
    }

    if (scopePushed && scope.parent) {
        // Pop handled by recursion naturally? NO.
        // We passed 'scope' (new one) to recursive calls?
        // Ah, walkForHighlighting(child, scope, ...).
        // Since we created new scope and stored in `scope` variable:
        // scope = new Scope(scope);
        // Then we pass this new scope to children.
        // When this function returns, the caller has the old scope.
        // So no explicit pop needed.
    }
}

function highlightIdentifier(node: LuaNode, scope: Scope, pending: PendingDecoration[]) {
    const name = node.name;
    if (!name) return; // Should not happen for Identifier nodes

    const resolved = scope.get(name);

    if (resolved) {
        if (resolved.kind === "parameter") {
            addDecoration(pending, node, parameterDecoration);
        } else if (resolved.kind === "function") {
            // Local function - yellow
            addDecoration(pending, node, functionDecoration);
        } else if (resolved.kind === "global") {
            // Context-related globals
            if (name === "context" || name === "prev" || name === "outputs") {
                addDecoration(pending, node, contextBaseDecoration);
            }
            // Helpers
            else if (name === "helpers") {
                addDecoration(pending, node, helpersBaseDecoration);
            }
            // Other globals
            else {
                addDecoration(pending, node, globalDecoration);
            }
        } else if (resolved.kind === "local") {
            // Check if it's an upvalue (defined in parent of current, but not global)
            if (isUpvalue(scope, name)) {
                addDecoration(pending, node, upvalueDecoration);
            } else {
                // Regular local - use subtle styling
                addDecoration(pending, node, localVarDecoration);
            }
        }
    } else {
        // Unknown variable -> likely global or builtin
        // Categorize builtins by type
        const functionBuiltins = ["print", "error", "assert", "pairs", "ipairs", "tonumber", "tostring", "type", "next", "select", "pcall", "xpcall", "await", "unpack", "setmetatable", "getmetatable"];

        // Check for special globals
        if (name === "context" || name === "prev" || name === "outputs") {
            addDecoration(pending, node, contextBaseDecoration);
        } else if (name === "helpers") {
            addDecoration(pending, node, helpersBaseDecoration);
        }
        // String library base - Namespace color
        else if (name === "string") {
            addDecoration(pending, node, libNamespaceDecoration);
        }
        // Table library base - Namespace color
        else if (name === "table") {
            addDecoration(pending, node, libNamespaceDecoration);
        }
        // Math library base - Namespace color
        else if (name === "math") {
            addDecoration(pending, node, libNamespaceDecoration);
        }
        // Builtin functions
        else if (functionBuiltins.includes(name)) {
            addDecoration(pending, node, builtinDecoration);
        }
        // Truly unknown global
        else {
            addDecoration(pending, node, unknownGlobalDecoration);
        }
    }
}

function isUpvalue(scope: Scope, name: string): boolean {
    // If the current scope has it directly, it's a local (not an upvalue)
    if (scope.variables.has(name)) return false;

    // Check if defined in any parent scope
    // If found in parent scope (at any level), it's an upvalue
    let curr: Scope | null = scope.parent;
    while (curr) {
        if (curr.variables.has(name)) {
            const varInfo = curr.variables.get(name);
            // If it's defined in a parent scope as 'local' OR 'parameter', it's an upvalue
            // Globals (like context, helpers) are NOT upvalues
            if (varInfo && (varInfo.kind === 'local' || varInfo.kind === 'parameter')) {
                return true;
            }
            return false;
        }
        curr = curr.parent;
    }
    return false;
}

function getRootScope(scope: Scope): Scope {
    let curr = scope;
    while (curr.parent) curr = curr.parent;
    return curr;
}

// Pending decoration to be sorted before building
interface PendingDecoration {
    start: number;
    end: number;
    deco: Decoration;
}

function addDecoration(pending: PendingDecoration[], node: LuaNode, deco: Decoration) {
    if (!node.range) return; // luaparse ranges
    const [start, end] = node.range;
    pending.push({ start, end, deco });
}


// =============================================================================
// PLUGIN
// =============================================================================

export const luaSemanticHighlighting = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.computeDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = this.computeDecorations(update.view);
            }
        }

        computeDecorations(view: EditorView): DecorationSet {
            const code = view.state.doc.toString();
            const pending: PendingDecoration[] = [];

            try {
                // We parse entire doc. For huge files this is slow, but 5KB limit is enforced.
                const ast = luaparse.parse(code, {
                    ranges: true,
                    locations: false,
                    luaVersion: "5.3",
                }) as unknown as LuaNode; // Cast to LuaNode

                const rootScope = new Scope({ start: 0, end: code.length });
                // Pre-populate globals
                rootScope.add("context", { name: "context", kind: "global", inferredType: { kind: "global" }, line: 0 });
                rootScope.add("helpers", { name: "helpers", kind: "global", inferredType: { kind: "global" }, line: 0 });
                rootScope.add("prev", { name: "prev", kind: "global", inferredType: { kind: "global" }, line: 0 });
                rootScope.add("outputs", { name: "outputs", kind: "global", inferredType: { kind: "global" }, line: 0 });

                walkForHighlighting(ast, rootScope, pending);

                // DEBUG: Log decorations being created
                if (pending.length > 0) {
                    console.log("[Semantic Highlighting] Created", pending.length, "decorations");
                    console.log("[Semantic Highlighting] Sample:", pending.slice(0, 5).map(p => ({
                        start: p.start,
                        end: p.end,
                        text: code.slice(p.start, p.end)
                    })));
                }
            } catch (e) {
                // Parse error - ignore (syntax highlighting survives)
                console.log("[Semantic Highlighting] Parse error:", e);
            }

            // Sort decorations by position (required by RangeSetBuilder)
            pending.sort((a, b) => a.start - b.start || a.end - b.end);

            // Build the decoration set
            const builder = new RangeSetBuilder<Decoration>();
            for (const p of pending) {
                builder.add(p.start, p.end, p.deco);
            }

            return builder.finish();
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);
