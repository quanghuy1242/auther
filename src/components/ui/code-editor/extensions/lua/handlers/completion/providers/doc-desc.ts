import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { getDefinitionLoader } from "../../../definitions/definition-loader";

// -----------------------------------------------------------------------------
// DESC PROVIDER (for description references)
// -----------------------------------------------------------------------------

/**
 * Provides completions for description references in comments
 * Following EmmyLua's desc_provider.rs (simplified)
 */
export class DescProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if in a see reference or description backtick
        if (!this.isInDescRef(builder)) return;

        // Add global symbols as references
        const definitionLoader = getDefinitionLoader();

        // Add sandbox items
        for (const name of definitionLoader.getSandboxItemNames()) {
            builder.addItem({
                label: name,
                kind: 18, // Reference
                detail: "(global)",
            });
        }

        // Add type names
        for (const name of definitionLoader.getTypeNames()) {
            builder.addItem({
                label: name,
                kind: 7, // Class
                detail: "(type)",
            });
        }

        builder.stopHere();
    }

    private isInDescRef(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // In a backtick reference or @see
        return /`[\w.]*$/.test(textBefore) || /---@see\s+[\w.]*$/.test(textBefore);
    }
}
