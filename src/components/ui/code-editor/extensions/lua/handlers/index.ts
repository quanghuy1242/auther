// =============================================================================
// HANDLERS INDEX
// =============================================================================
// Re-export all LSP handler modules
// Following EmmyLua's handlers/mod.rs structure

export {
    CompletionBuilder,
    CompletionTriggerStatus,
    getCompletions,
    type CompletionOptions,
    type CompletionProvider,
    MemberProvider,
    EnvProvider,
    KeywordsProvider,
} from "./completion";

export {
    HoverBuilder,
    getHover,
    type HoverOptions,
} from "./hover";

export {
    SignatureHelpBuilder,
    getSignatureHelp,
    getCallRange,
    findCallContext,
    calculateActiveParameter,
    extractFunctionInfo,
    type SignatureHelpOptions,
} from "./signature-help";

export {
    getDiagnostics,
    analyzeAndGetDiagnostics,
    type DiagnosticOptions,
    type DiagnosticProvider,
    type DiagnosticContext,
    ScriptSizeProvider,
    DisabledGlobalProvider,
    ReturnValidationProvider,
    NestedLoopProvider,
    AsyncUsageProvider,
} from "./diagnostics";

export {
    getDefinition,
    getDefinitionAtOffset,
    type DefinitionResult,
    type DefinitionOptions,
} from "./definition";

export {
    getReferences,
    getSymbolReferences,
    getAllSymbolOccurrences,
    ReferenceSearcher,
    type Reference,
    type ReferencesOptions,
} from "./references";

export {
    getDocumentSymbols,
    getFlatSymbols,
    DocumentSymbolBuilder,
    type DocumentSymbolOptions,
} from "./document-symbols";

export {
    getSemanticTokens,
    SemanticTokensBuilder,
    TOKEN_TYPES,
    TOKEN_MODIFIERS,
} from "./semantic-tokens";
