// =============================================================================
// LSP PROTOCOL TYPES
// =============================================================================
// Standard LSP types adapted for in-browser mini LSP
// Follows: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/

// =============================================================================
// POSITION & RANGE
// =============================================================================

/**
 * Position in a text document expressed as zero-based line and character offset.
 * Similar to EmmyLua's TextRange but LSP-compatible.
 */
export interface Position {
    /** Line position (0-indexed) */
    line: number;
    /** Character offset on line (0-indexed) */
    character: number;
}

/**
 * A range in a text document expressed as (start, end) positions.
 */
export interface Range {
    start: Position;
    end: Position;
}

/**
 * Represents a location inside a resource, such as a line inside a text file.
 */
export interface Location {
    uri: string;
    range: Range;
}

/**
 * Represents a link between a source and a target location.
 */
export interface LocationLink {
    originSelectionRange?: Range;
    targetUri: string;
    targetRange: Range;
    targetSelectionRange: Range;
}

// =============================================================================
// TEXT DOCUMENT
// =============================================================================

/**
 * Text document identifier containing a URI.
 */
export interface TextDocumentIdentifier {
    uri: string;
}

/**
 * An item to transfer a text document from the client to the server.
 */
export interface TextDocumentItem {
    uri: string;
    languageId: string;
    version: number;
    text: string;
}

/**
 * Describes textual changes on a single text document.
 */
export interface TextEdit {
    range: Range;
    newText: string;
}

/**
 * An event describing a change to a text document.
 */
export interface TextDocumentContentChangeEvent {
    range?: Range;
    rangeLength?: number;
    text: string;
}

// =============================================================================
// MARKUP CONTENT
// =============================================================================

export enum MarkupKind {
    PlainText = "plaintext",
    Markdown = "markdown",
}

export interface MarkupContent {
    kind: MarkupKind;
    value: string;
}

// =============================================================================
// DIAGNOSTIC
// =============================================================================

export enum DiagnosticSeverity {
    Error = 1,
    Warning = 2,
    Information = 3,
    Hint = 4,
}

export enum DiagnosticTag {
    Unnecessary = 1,
    Deprecated = 2,
}

export interface DiagnosticRelatedInformation {
    location: Location;
    message: string;
}

export interface Diagnostic {
    range: Range;
    severity?: DiagnosticSeverity;
    code?: number | string;
    codeDescription?: { href: string };
    source?: string;
    message: string;
    tags?: DiagnosticTag[];
    relatedInformation?: DiagnosticRelatedInformation[];
    data?: unknown;
}

// =============================================================================
// COMPLETION
// =============================================================================

export enum CompletionItemKind {
    Text = 1,
    Method = 2,
    Function = 3,
    Constructor = 4,
    Field = 5,
    Variable = 6,
    Class = 7,
    Interface = 8,
    Module = 9,
    Property = 10,
    Unit = 11,
    Value = 12,
    Enum = 13,
    Keyword = 14,
    Snippet = 15,
    Color = 16,
    File = 17,
    Reference = 18,
    Folder = 19,
    EnumMember = 20,
    Constant = 21,
    Struct = 22,
    Event = 23,
    Operator = 24,
    TypeParameter = 25,
}

export enum CompletionItemTag {
    Deprecated = 1,
}

export enum InsertTextFormat {
    PlainText = 1,
    Snippet = 2,
}

export interface CompletionItem {
    label: string;
    labelDetails?: {
        detail?: string;
        description?: string;
    };
    kind?: CompletionItemKind;
    tags?: CompletionItemTag[];
    detail?: string;
    documentation?: string | MarkupContent;
    deprecated?: boolean;
    preselect?: boolean;
    sortText?: string;
    filterText?: string;
    insertText?: string;
    insertTextFormat?: InsertTextFormat;
    textEdit?: TextEdit;
    additionalTextEdits?: TextEdit[];
    commitCharacters?: string[];
    data?: unknown;
}

export interface CompletionList {
    isIncomplete: boolean;
    items: CompletionItem[];
}

// =============================================================================
// HOVER
// =============================================================================

export interface Hover {
    contents: MarkupContent | MarkupContent[];
    range?: Range;
}

// =============================================================================
// SIGNATURE HELP
// =============================================================================

export interface ParameterInformation {
    label: string | [number, number];
    documentation?: string | MarkupContent;
}

export interface SignatureInformation {
    label: string;
    documentation?: string | MarkupContent;
    parameters?: ParameterInformation[];
    activeParameter?: number;
}

export interface SignatureHelp {
    signatures: SignatureInformation[];
    activeSignature?: number;
    activeParameter?: number;
}

// =============================================================================
// SEMANTIC TOKENS
// =============================================================================

export interface SemanticTokensLegend {
    tokenTypes: string[];
    tokenModifiers: string[];
}

/**
 * Semantic token types matching VSCode's built-in types
 */
export enum SemanticTokenType {
    Namespace = "namespace",
    Type = "type",
    Class = "class",
    Enum = "enum",
    Interface = "interface",
    Struct = "struct",
    TypeParameter = "typeParameter",
    Parameter = "parameter",
    Variable = "variable",
    Property = "property",
    EnumMember = "enumMember",
    Event = "event",
    Function = "function",
    Method = "method",
    Macro = "macro",
    Keyword = "keyword",
    Modifier = "modifier",
    Comment = "comment",
    String = "string",
    Number = "number",
    Regexp = "regexp",
    Operator = "operator",
    Decorator = "decorator",
}

export enum SemanticTokenModifier {
    Declaration = "declaration",
    Definition = "definition",
    Readonly = "readonly",
    Static = "static",
    Deprecated = "deprecated",
    Abstract = "abstract",
    Async = "async",
    Modification = "modification",
    Documentation = "documentation",
    DefaultLibrary = "defaultLibrary",
}

export interface SemanticTokens {
    resultId?: string;
    data: number[];
}

// =============================================================================
// INLAY HINTS
// =============================================================================

export enum InlayHintKind {
    Type = 1,
    Parameter = 2,
}

export interface InlayHint {
    position: Position;
    label: string | InlayHintLabelPart[];
    kind?: InlayHintKind;
    textEdits?: TextEdit[];
    tooltip?: string | MarkupContent;
    paddingLeft?: boolean;
    paddingRight?: boolean;
    data?: unknown;
}

export interface InlayHintLabelPart {
    value: string;
    tooltip?: string | MarkupContent;
    location?: Location;
    command?: Command;
}

export interface Command {
    title: string;
    command: string;
    arguments?: unknown[];
}

// =============================================================================
// CODE ACTIONS
// =============================================================================

export enum CodeActionKind {
    Empty = "",
    QuickFix = "quickfix",
    Refactor = "refactor",
    RefactorExtract = "refactor.extract",
    RefactorInline = "refactor.inline",
    RefactorRewrite = "refactor.rewrite",
    Source = "source",
    SourceOrganizeImports = "source.organizeImports",
    SourceFixAll = "source.fixAll",
}

export interface CodeAction {
    title: string;
    kind?: CodeActionKind;
    diagnostics?: Diagnostic[];
    isPreferred?: boolean;
    disabled?: { reason: string };
    edit?: WorkspaceEdit;
    command?: Command;
    data?: unknown;
}

export interface WorkspaceEdit {
    changes?: { [uri: string]: TextEdit[] };
}

// =============================================================================
// SYMBOL INFORMATION
// =============================================================================

export enum SymbolKind {
    File = 1,
    Module = 2,
    Namespace = 3,
    Package = 4,
    Class = 5,
    Method = 6,
    Property = 7,
    Field = 8,
    Constructor = 9,
    Enum = 10,
    Interface = 11,
    Function = 12,
    Variable = 13,
    Constant = 14,
    String = 15,
    Number = 16,
    Boolean = 17,
    Array = 18,
    Object = 19,
    Key = 20,
    Null = 21,
    EnumMember = 22,
    Struct = 23,
    Event = 24,
    Operator = 25,
    TypeParameter = 26,
}

export interface DocumentSymbol {
    name: string;
    detail?: string;
    kind: SymbolKind;
    tags?: number[];
    deprecated?: boolean;
    range: Range;
    selectionRange: Range;
    children?: DocumentSymbol[];
}

// =============================================================================
// CALL HIERARCHY
// =============================================================================

export interface CallHierarchyItem {
    name: string;
    kind: SymbolKind;
    tags?: number[];
    detail?: string;
    uri: string;
    range: Range;
    selectionRange: Range;
    data?: unknown;
}

export interface CallHierarchyIncomingCall {
    from: CallHierarchyItem;
    fromRanges: Range[];
}

export interface CallHierarchyOutgoingCall {
    to: CallHierarchyItem;
    fromRanges: Range[];
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a Position from line and character
 */
export function createPosition(line: number, character: number): Position {
    return { line, character };
}

/**
 * Create a Range from start and end positions
 */
export function createRange(start: Position, end: Position): Range {
    return { start, end };
}

/**
 * Create a Range from line/character coordinates
 */
export function createRangeFromCoords(
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number
): Range {
    return {
        start: { line: startLine, character: startChar },
        end: { line: endLine, character: endChar },
    };
}

/**
 * Check if a position is inside a range
 */
export function isPositionInRange(pos: Position, range: Range): boolean {
    if (pos.line < range.start.line || pos.line > range.end.line) {
        return false;
    }
    if (pos.line === range.start.line && pos.character < range.start.character) {
        return false;
    }
    if (pos.line === range.end.line && pos.character > range.end.character) {
        return false;
    }
    return true;
}

/**
 * Compare two positions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function comparePositions(a: Position, b: Position): number {
    if (a.line < b.line) return -1;
    if (a.line > b.line) return 1;
    if (a.character < b.character) return -1;
    if (a.character > b.character) return 1;
    return 0;
}

/**
 * Check if two ranges overlap
 */
export function rangesOverlap(a: Range, b: Range): boolean {
    if (comparePositions(a.end, b.start) < 0) return false;
    if (comparePositions(b.end, a.start) < 0) return false;
    return true;
}

/**
 * Create markdown content
 */
export function markdown(value: string): MarkupContent {
    return { kind: MarkupKind.Markdown, value };
}

/**
 * Create plaintext content
 */
export function plaintext(value: string): MarkupContent {
    return { kind: MarkupKind.PlainText, value };
}
