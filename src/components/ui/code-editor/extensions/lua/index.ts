// =============================================================================
// LUA EXTENSIONS 2 - ENTRY POINT
// =============================================================================
// LSP-inspired Lua editor extensions for the Pipeline Editor
// Based on EmmyLua Analyzer architecture

// Core exports
export { LuaDocument, type LuaParseError } from "./core/document";
export * from "./core/luaparse-types";

// Protocol exports
export * from "./protocol";

// Definition exports
export {
    DefinitionLoader,
    getDefinitionLoader,
    type FunctionDefinition,
    type PropertyDefinition,
    type TableDefinition,
    type FieldDefinition,
    type ParamDefinition,
    type ReturnDefinition,
    type TypeDefinition,
    type HookVariant,
    type ContextDefinition,
} from "./definitions/definition-loader";

// Type system exports
export {
    LuaTypeKind,
    LuaTypes,
    type LuaType,
    type LuaPrimitiveType,
    type LuaBooleanLiteralType,
    type LuaNumberLiteralType,
    type LuaStringLiteralType,
    type LuaUnionType,
    type LuaIntersectionType,
    type LuaArrayType,
    type LuaTupleType,
    type LuaRefType,
    type LuaTableType,
    type LuaTableTypeField,
    type LuaFunctionType,
    type LuaFunctionParam,
    type LuaGenericType,
    type LuaTypeParameterType,
    type LuaVariadicType,
    booleanLiteral,
    numberLiteral,
    stringLiteral,
    unionType,
    intersectionType,
    arrayType,
    tupleType,
    refType,
    tableType,
    functionType,
    variadicType,
    typesEqual,
    isAssignableTo,
    widenType,
    isTruthy,
    mayBeNil,
    formatType,
    parseTypeString,
    definitionToType,
    globalDefinitionToType,
} from "./analysis/type-system";

// Symbol table exports
export {
    SymbolTable,
    SymbolKind,
    ScopeKind,
    createSandboxSymbols,
    type Symbol,
    type SymbolId,
    type Scope,
    type ScopeId,
    type SymbolAttributes,
} from "./analysis/symbol-table";

// Diagnostics exports
export {
    DiagnosticCode,
    DiagnosticCollector,
    DiagnosticBuilder,
    diagnostic,
    getDefaultSeverity,
    getDiagnosticTags,
    getCodePrefix,
} from "./analysis/diagnostics";

// Analyzer exports
export {
    SemanticAnalyzer,
    analyzeDocument,
    type AnalyzerOptions,
    type AnalysisResult,
} from "./analysis/analyzer";

// Handler exports
export {
    // Completion
    CompletionBuilder,
    CompletionTriggerStatus,
    getCompletions,
    type CompletionOptions,
    type CompletionProvider,
    MemberProvider,
    EnvProvider,
    KeywordsProvider,
    // Hover
    HoverBuilder,
    getHover,
    type HoverOptions,
    // Signature help
    SignatureHelpBuilder,
    getSignatureHelp,
    getCallRange,
    type SignatureHelpOptions,
    // Diagnostics
    getDiagnostics,
    analyzeAndGetDiagnostics,
    type DiagnosticOptions,
    // Definition
    getDefinition,
    getDefinitionAtOffset,
    type DefinitionResult,
    type DefinitionOptions,
    // References
    getReferences,
    getSymbolReferences,
    getAllSymbolOccurrences,
    type Reference,
    type ReferencesOptions,
    // Document symbols
    getDocumentSymbols,
    getFlatSymbols,
    type DocumentSymbolOptions,
} from "./handlers";

// CodeMirror integration exports
export {
    createLuaExtensions,
    type LuaExtensionsOptions,
    createCompletionSource,
    createHoverTooltip,
    createSignatureHelp,
    signatureHelpField,
    closeSignatureHelp,
    createLinter,
    createGotoDefinition,
    createFindReferences,
    createDocumentOutline,
    LUA_TOOLTIP_STYLES,
} from "./codemirror";
