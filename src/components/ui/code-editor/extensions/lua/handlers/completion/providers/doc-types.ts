import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { getDefinitionLoader } from "../../../definitions/definition-loader";

// -----------------------------------------------------------------------------
// DOC TYPE PROVIDER (for type completions in annotations)
// -----------------------------------------------------------------------------

/**
 * Provides type name completions inside doc annotations
 * Following EmmyLua's doc_type_provider.rs
 */
export class DocTypeProvider implements CompletionProvider {
    private readonly builtinTypes = [
        "nil", "boolean", "number", "string", "table", "function",
        "thread", "userdata", "any", "unknown", "void",
    ];

    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if we're in a type annotation context
        if (!this.isInTypeContext(builder)) return;

        // Add builtin types
        for (const typeName of this.builtinTypes) {
            builder.addItem({
                label: typeName,
                kind: 7, // Class
                detail: "(builtin)",
            });
        }

        // Add custom type definitions from definition loader
        const definitionLoader = getDefinitionLoader();
        const typeNames = definitionLoader.getTypeNames();
        for (const typeName of typeNames) {
            if (!this.builtinTypes.includes(typeName)) {
                builder.addItem({
                    label: typeName,
                    kind: 7, // Class
                    detail: "(defined)",
                });
            }
        }

        builder.stopHere();
    }

    private isInTypeContext(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // After @param name, @return, @type, @field name, @alias name
        return /---@(?:param\s+\w+\s+|return\s+|type\s+|field\s+\w+\s+|alias\s+\w+\s+)[\w.]*$/.test(textBefore);
    }
}
