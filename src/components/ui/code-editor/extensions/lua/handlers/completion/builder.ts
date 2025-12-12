import type { Position, CompletionItem } from "../../protocol";
import type { CompletionOptions } from "./types";
import type { LuaDocument } from "../../core/document";
import type { AnalysisResult } from "../../analysis/analyzer";
import { CompletionTriggerStatus } from "./types";

// =============================================================================
// COMPLETION BUILDER
// =============================================================================

/**
 * Builder for constructing completion items
 * Following EmmyLua's CompletionBuilder pattern
 */
export class CompletionBuilder {
    private items: CompletionItem[] = [];
    private duplicateNames: Set<string> = new Set();
    private stopped = false;

    constructor(
        readonly document: LuaDocument,
        readonly analysisResult: AnalysisResult,
        readonly position: Position,
        readonly offset: number,
        readonly triggerStatus: CompletionTriggerStatus,
        readonly triggerCharacter?: string,
        readonly options: CompletionOptions = {}
    ) { }

    /**
     * Check if builder has stopped accepting completions
     */
    isStopped(): boolean {
        return this.stopped;
    }

    /**
     * Stop accepting more completions (e.g., after a provider handles the context)
     */
    stopHere(): void {
        this.stopped = true;
    }

    /**
     * Check if a name has already been added
     */
    isDuplicate(name: string): boolean {
        return this.duplicateNames.has(name);
    }

    /**
     * Add a completion item
     */
    addItem(item: CompletionItem): void {
        if (this.stopped) return;
        if (this.duplicateNames.has(item.label)) return;

        this.duplicateNames.add(item.label);
        this.items.push(item);
    }

    /**
     * Add multiple items
     */
    addItems(items: CompletionItem[]): void {
        for (const item of items) {
            this.addItem(item);
        }
    }

    /**
     * Get all completion items with sort text applied
     */
    getCompletionItems(): CompletionItem[] {
        // Apply sort text to items that don't have one
        return this.items.map((item, index) => ({
            ...item,
            sortText: item.sortText ?? String(index + 32).padStart(4, "0"),
        }));
    }

    /**
     * Get trigger text at current position
     */
    getTriggerText(): string {
        // Get the text from line start to cursor
        const line = this.document.getLine(this.position.line);
        return line.slice(0, this.position.character).trimEnd();
    }

    /**
     * Get the word being typed at cursor
     */
    getCurrentWord(): string {
        const line = this.document.getLine(this.position.line);
        const textBeforeCursor = line.slice(0, this.position.character);

        // Find start of current word (identifier characters)
        let wordStart = textBeforeCursor.length;
        while (wordStart > 0 && /[\w_]/.test(textBeforeCursor[wordStart - 1])) {
            wordStart--;
        }

        return textBeforeCursor.slice(wordStart);
    }
}
