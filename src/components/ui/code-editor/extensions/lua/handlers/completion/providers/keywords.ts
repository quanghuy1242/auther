import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { CompletionTriggerStatus } from "../types";

// -----------------------------------------------------------------------------
// KEYWORDS PROVIDER
// -----------------------------------------------------------------------------

/**
 * Provides Lua keyword completions
 * Following EmmyLua's keywords_provider.rs
 */
export class KeywordsProvider implements CompletionProvider {
    private readonly keywords = [
        "and", "break", "do", "else", "elseif", "end", "false", "for",
        "function", "goto", "if", "in", "local", "nil", "not", "or",
        "repeat", "return", "then", "true", "until", "while",
    ];

    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Only for general completion context
        if (builder.triggerStatus !== CompletionTriggerStatus.General) {
            return;
        }

        // Prevent aggressive completion on new lines or empty text
        // (unless triggered manually, but we don't have that info easily, so we rely on word existence)
        const word = builder.getCurrentWord();
        if (!word && !builder.options.isExplicit) {
            return;
        }

        for (const keyword of this.keywords) {
            builder.addItem({
                label: keyword,
                kind: 14, // Keyword
                detail: `(keyword) ${keyword}`,
            });
        }
    }
}
