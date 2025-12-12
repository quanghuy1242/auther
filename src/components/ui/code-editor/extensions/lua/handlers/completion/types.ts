import type { CompletionBuilder } from "./builder";

// =============================================================================
// COMPLETION TRIGGER STATUS
// =============================================================================

/**
 * The trigger context for completion
 * Following EmmyLua's CompletionTriggerStatus pattern
 */
export enum CompletionTriggerStatus {
    /** Triggered by '.' for member access */
    Dot = "dot",
    /** Triggered by ':' for method access */
    Colon = "colon",
    /** Triggered by '[' for index access */
    LeftBracket = "left_bracket",
    /** Triggered inside string (for index expressions) */
    InString = "in_string",
    /** Triggered inside table constructor { } */
    InTableConstructor = "in_table_constructor",
    /** Triggered inside function call arguments */
    InCallArguments = "in_call_arguments",
    /** Triggered inside function call arguments with comma (new arg) */
    InCallArgumentsNext = "in_call_arguments_next",
    /** General completion (variable, keyword, etc.) */
    General = "general",
}

// =============================================================================
// COMPLETION PROVIDER INTERFACE
// =============================================================================

/**
 * Provider interface following EmmyLua's provider pattern
 */
export interface CompletionProvider {
    addCompletions(builder: CompletionBuilder): void;
}

export interface CompletionOptions {
    /** Current hook name for context-aware completion */
    hookName?: string;
    /** Whether to include deprecated items */
    includeDeprecated?: boolean;
    /** Whether completion was explicitly triggered */
    isExplicit?: boolean;
}
