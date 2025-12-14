// =============================================================================
// OUTPUTS PROVIDER
// =============================================================================
// Provides completions for context.outputs["script_id"] access patterns.
// Enables autocomplete for:
// 1. Script IDs when typing context.outputs["
// 2. Output fields (.allowed, .error, .data) after context.outputs["id"]
// 3. Data fields from inferred return types

import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import {
    getReachableScripts,
    findScriptById,
    type DagContext,
} from "../../../analysis/dag-context";
import { extractReturnType } from "../../../analysis/extract-return-type";
import {
    LuaTypeKind,
    type LuaTableType,
    type LuaType,
} from "../../../analysis/type-system";

/**
 * Provider for context.outputs completions
 * Following EmmyLua's provider pattern
 */
export class OutputsProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        const dagContext = builder.options.dagContext;
        if (!dagContext) return;

        const lineText = builder.document.getLine(builder.position.line);
        const textBefore = lineText.slice(0, builder.position.character);

        // Pattern 1: context.outputs["  -> suggest script IDs
        if (this.isInsideOutputsIndex(textBefore)) {
            this.addScriptIdCompletions(builder, dagContext);
            builder.stopHere();
            return;
        }

        // Pattern 2: context.outputs["id"].  -> suggest output fields
        const outputAccess = this.parseOutputAccess(textBefore);
        if (outputAccess) {
            if (outputAccess.afterDot) {
                if (outputAccess.field === "data") {
                    // Pattern 3: context.outputs["id"].data.  -> infer from script return
                    this.addDataFieldCompletions(builder, dagContext, outputAccess.scriptId);
                } else {
                    // Pattern 2: context.outputs["id"].  -> standard output fields
                    this.addOutputFieldCompletions(builder, dagContext, outputAccess.scriptId);
                }
                builder.stopHere();
            }
        }
    }

    /**
     * Check if cursor is inside context.outputs["...
     */
    private isInsideOutputsIndex(textBefore: string): boolean {
        // Match context.outputs[" with optional partial string
        return /context\.outputs\[\s*["'][^"']*$/.test(textBefore);
    }

    /**
     * Parse context.outputs["id"] access pattern
     */
    private parseOutputAccess(textBefore: string): {
        scriptId: string;
        afterDot: boolean;
        field?: string;
    } | null {
        // Check nested field access FIRST (e.g., context.outputs["id"].data.)
        // This is more specific and must be checked before the simpler pattern
        const nestedMatch = textBefore.match(
            /context\.outputs\[\s*["']([^"']+)["']\s*\]\.(\w+)\.(\w*)$/
        );
        if (nestedMatch) {
            return {
                scriptId: nestedMatch[1],
                afterDot: true,
                field: nestedMatch[2], // "data" in context.outputs["id"].data.
            };
        }

        // Match context.outputs["script_id"].field or context.outputs["script_id"].
        const match = textBefore.match(
            /context\.outputs\[\s*["']([^"']+)["']\s*\]\.(\w*)$/
        );
        if (match) {
            return {
                scriptId: match[1],
                afterDot: true,
                field: match[2] || undefined,
            };
        }

        return null;
    }

    /**
     * Add script ID completions
     */
    private addScriptIdCompletions(
        builder: CompletionBuilder,
        dagContext: DagContext
    ): void {
        const reachable = getReachableScripts(dagContext);

        for (const script of reachable) {
            // Show script name as label, insert script ID
            // User already typed [" and closeBrackets added "] so we just insert the ID
            builder.addItem({
                label: script.name || `Script ${script.id.slice(0, 8)}`,
                kind: 12, // Value
                detail: `Script ID: ${script.id.slice(0, 8)}...`,
                documentation: `Full ID: ${script.id}\nLayer: ${script.layerIndex}`,
                insertText: script.id,
                insertTextFormat: 1, // PlainText
                sortText: String(script.layerIndex).padStart(4, "0"),
            });
        }
    }

    /**
     * Add output field completions (allowed, error, data)
     */
    private addOutputFieldCompletions(
        builder: CompletionBuilder,
        dagContext: DagContext,
        scriptId: string
    ): void {
        const script = findScriptById(dagContext, scriptId);

        // Standard ScriptOutput fields
        builder.addItem({
            label: "allowed",
            kind: 6, // Property
            detail: "boolean",
            documentation: "Whether script allowed the action",
            insertText: "allowed",
            insertTextFormat: 1,
        });

        builder.addItem({
            label: "error",
            kind: 6, // Property
            detail: "string?",
            documentation: "Error message if action was blocked",
            insertText: "error",
            insertTextFormat: 1,
        });

        // Check if script has data in its return
        if (script) {
            const returnType = extractReturnType(script.code);
            if (returnType.kind === LuaTypeKind.TableType) {
                const tbl = returnType as LuaTableType;
                if (tbl.fields?.has("data")) {
                    builder.addItem({
                        label: "data",
                        kind: 6, // Property
                        detail: "table?",
                        documentation: "Custom data from script return",
                        insertText: "data",
                        insertTextFormat: 1,
                    });
                }
            }
        } else {
            // Script not found, show generic data field
            builder.addItem({
                label: "data",
                kind: 6, // Property
                detail: "table?",
                documentation: "Custom data from script return",
                insertText: "data",
                insertTextFormat: 1,
            });
        }
    }

    /**
     * Add data field completions from inferred script return type
     */
    private addDataFieldCompletions(
        builder: CompletionBuilder,
        dagContext: DagContext,
        scriptId: string
    ): void {
        const script = findScriptById(dagContext, scriptId);
        if (!script) return;

        const returnType = extractReturnType(script.code);
        if (returnType.kind !== LuaTypeKind.TableType) return;

        const tbl = returnType as LuaTableType;
        const dataField = tbl.fields?.get("data");
        if (!dataField || dataField.type.kind !== LuaTypeKind.TableType) return;

        const dataType = dataField.type as LuaTableType;
        let idx = 0;
        for (const field of dataType.fields.values()) {
            builder.addItem({
                label: field.name,
                kind: 6, // Property
                detail: this.formatType(field.type),
                documentation: `Field from script "${script.name}"`,
                insertText: field.name,
                insertTextFormat: 1,
                sortText: `0${String(idx++).padStart(4, "0")}`, // Prioritize at top
            });
        }
    }

    /**
     * Simple type formatting
     */
    private formatType(type: LuaType): string {
        switch (type.kind) {
            case LuaTypeKind.String:
                return "string";
            case LuaTypeKind.Number:
                return "number";
            case LuaTypeKind.Boolean:
                return "boolean";
            case LuaTypeKind.TableType:
                return "table";
            default:
                return "unknown";
        }
    }
}
