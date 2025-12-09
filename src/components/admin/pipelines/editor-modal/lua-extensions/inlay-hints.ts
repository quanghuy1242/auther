
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import * as luaparse from "luaparse";
import { inferVariableTypes, formatLuaType, type VariableType } from "./type-inference";

// =============================================================================
// INLAY HINT WIDGET
// =============================================================================

class TypeHintWidget extends WidgetType {
    constructor(readonly typeName: string) {
        super();
    }

    eq(other: TypeHintWidget) {
        return other.typeName == this.typeName;
    }

    toDOM() {
        const span = document.createElement("span");
        span.className = "cm-lua-inlay-hint";
        span.textContent = `: ${this.typeName}`;
        span.style.cssText = `
            color: #7d8799;
            font-family: inherit;
            font-size: 0.85em;
            margin-left: 2px;
            opacity: 0.8;
            background: rgba(0,0,0,0.1);
            border-radius: 3px;
            padding: 0 2px;
            vertical-align: middle;
        `;
        return span;
    }

    ignoreEvent() {
        return false;
    }
}



// Pending decoration entry
interface PendingHintDecoration {
    pos: number;
    deco: Decoration;
}

export const luaInlayHints = ViewPlugin.fromClass(
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
            const pending: PendingHintDecoration[] = [];

            try {
                // Use the full type inference system
                const { variables, rootScope } = inferVariableTypes(code);
                if (!rootScope) return new RangeSetBuilder<Decoration>().finish();

                // Parse AST to get positions
                const ast = luaparse.parse(code, {
                    ranges: true,
                    locations: false,
                    luaVersion: "5.3"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }) as any;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const visit = (node: any) => {
                    if (!node) return;

                    if (node.type === "LocalStatement") {
                        const vars = node.variables || [];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        vars.forEach((v: any) => {
                            if (v.type === "Identifier" && v.name) {
                                const scope = rootScope.findScopeAt(v.range[0]);
                                let varInfo: VariableType | undefined;

                                // Local declaration is always in the immediate scope found (or should be)
                                if (scope) {
                                    varInfo = scope.variables.get(v.name);
                                }

                                // Fallback to global map if not found (though unlikely for valid locals)
                                if (!varInfo) varInfo = variables.get(v.name);

                                if (varInfo && varInfo.inferredType.kind !== "unknown") {
                                    const typeStr = formatLuaType(varInfo.inferredType);
                                    const end = v.range[1];
                                    pending.push({
                                        pos: end,
                                        deco: Decoration.widget({
                                            widget: new TypeHintWidget(typeStr),
                                            side: 1
                                        })
                                    });
                                }
                            }
                        });
                    }

                    // Traverse children
                    for (const key in node) {
                        if (key === "type" || key === "loc" || key === "range") continue;
                        const child = node[key];
                        if (Array.isArray(child)) child.forEach(visit);
                        else if (child && typeof child === "object" && child.type) visit(child);
                    }
                };

                visit(ast);

            } catch {
                // ignore parse errors
            }

            // Sort by position (required by RangeSetBuilder)
            pending.sort((a, b) => a.pos - b.pos);

            // Build the decoration set
            const builder = new RangeSetBuilder<Decoration>();
            for (const p of pending) {
                builder.add(p.pos, p.pos, p.deco);
            }

            return builder.finish();
        }
    },
    {
        decorations: (v) => v.decorations,
    }
);

