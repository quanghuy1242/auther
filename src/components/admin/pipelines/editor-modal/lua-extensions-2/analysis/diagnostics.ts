// =============================================================================
// DIAGNOSTICS
// =============================================================================
// Diagnostic codes and collector inspired by EmmyLua's DiagnosticIndex
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/db_index/diagnostic/

import type { Diagnostic, DiagnosticRelatedInformation, Range } from "../protocol";
import { DiagnosticSeverity, DiagnosticTag } from "../protocol";

// =============================================================================
// DIAGNOSTIC CODES
// =============================================================================

/**
 * Diagnostic codes for Lua analysis
 * Organized by category for maintainability
 */
export enum DiagnosticCode {
    // Syntax errors (1xxx)
    SyntaxError = 1001,
    UnexpectedToken = 1002,
    UnterminatedString = 1003,
    InvalidEscape = 1004,

    // Name resolution (2xxx)
    UndefinedVariable = 2001,
    UndefinedGlobal = 2002,
    UndefinedField = 2003,
    UnusedVariable = 2004,
    UnusedParameter = 2005,
    UnusedFunction = 2006,
    ShadowedVariable = 2007,
    GlobalInLocalScope = 2008,

    // Type errors (3xxx)
    TypeMismatch = 3001,
    InvalidOperand = 3002,
    InvalidCallTarget = 3003,
    WrongArgumentCount = 3004,
    InvalidIndex = 3005,
    NilAccess = 3006,
    InvalidReturnType = 3007,

    // Sandbox/Security (4xxx)
    DisabledGlobal = 4001,
    BlockedModule = 4002,
    UnsafeOperation = 4003,
    PrivateAccess = 4004,

    // Code quality (5xxx)
    UnreachableCode = 5001,
    RedundantCondition = 5002,
    EmptyBlock = 5003,
    DeprecatedUsage = 5004,
    DuplicateKey = 5005,
    MissingReturn = 5006,
    InvalidReturn = 5007,
    DeeplyNestedLoop = 5008,

    // Pipeline specific (6xxx)
    ScriptTooLarge = 6001,
    MissingRequiredReturn = 6002,
    InvalidReturnFormat = 6003,
    AsyncWithoutAwait = 6004,
    InvalidHookAccess = 6005,
}

/**
 * Get default severity for a diagnostic code
 */
export function getDefaultSeverity(code: DiagnosticCode): DiagnosticSeverity {
    switch (code) {
        // Errors
        case DiagnosticCode.SyntaxError:
        case DiagnosticCode.UnexpectedToken:
        case DiagnosticCode.UnterminatedString:
        case DiagnosticCode.InvalidEscape:
        case DiagnosticCode.UndefinedVariable:
        case DiagnosticCode.DisabledGlobal:
        case DiagnosticCode.BlockedModule:
        case DiagnosticCode.TypeMismatch:
        case DiagnosticCode.InvalidCallTarget:
        case DiagnosticCode.MissingRequiredReturn:
        case DiagnosticCode.InvalidReturnFormat:
        case DiagnosticCode.ScriptTooLarge:
            return DiagnosticSeverity.Error;

        // Warnings
        case DiagnosticCode.UndefinedGlobal:
        case DiagnosticCode.UndefinedField:
        case DiagnosticCode.UnusedVariable:
        case DiagnosticCode.UnusedParameter:
        case DiagnosticCode.UnusedFunction:
        case DiagnosticCode.ShadowedVariable:
        case DiagnosticCode.GlobalInLocalScope:
        case DiagnosticCode.WrongArgumentCount:
        case DiagnosticCode.InvalidIndex:
        case DiagnosticCode.NilAccess:
        case DiagnosticCode.InvalidReturnType:
        case DiagnosticCode.DeeplyNestedLoop:
        case DiagnosticCode.AsyncWithoutAwait:
        case DiagnosticCode.InvalidHookAccess:
            return DiagnosticSeverity.Warning;

        // Information
        case DiagnosticCode.UnreachableCode:
        case DiagnosticCode.RedundantCondition:
        case DiagnosticCode.EmptyBlock:
        case DiagnosticCode.DuplicateKey:
        case DiagnosticCode.MissingReturn:
        case DiagnosticCode.InvalidReturn:
            return DiagnosticSeverity.Information;

        // Hints
        case DiagnosticCode.DeprecatedUsage:
        case DiagnosticCode.UnsafeOperation:
        case DiagnosticCode.PrivateAccess:
            return DiagnosticSeverity.Hint;

        default:
            return DiagnosticSeverity.Warning;
    }
}

/**
 * Get tags for a diagnostic code
 */
export function getDiagnosticTags(code: DiagnosticCode): DiagnosticTag[] {
    switch (code) {
        case DiagnosticCode.UnusedVariable:
        case DiagnosticCode.UnusedParameter:
        case DiagnosticCode.UnusedFunction:
        case DiagnosticCode.UnreachableCode:
            return [DiagnosticTag.Unnecessary];

        case DiagnosticCode.DeprecatedUsage:
            return [DiagnosticTag.Deprecated];

        default:
            return [];
    }
}

/**
 * Get a human-readable message prefix for a code
 */
export function getCodePrefix(code: DiagnosticCode): string {
    if (code >= 1000 && code < 2000) return "syntax";
    if (code >= 2000 && code < 3000) return "name";
    if (code >= 3000 && code < 4000) return "type";
    if (code >= 4000 && code < 5000) return "sandbox";
    if (code >= 5000 && code < 6000) return "quality";
    if (code >= 6000 && code < 7000) return "pipeline";
    return "lua";
}

// =============================================================================
// DIAGNOSTIC BUILDER
// =============================================================================

/**
 * Builder for creating diagnostics with a fluent API
 */
export class DiagnosticBuilder {
    private diagnostic: Diagnostic;

    constructor(range: Range, message: string, code: DiagnosticCode) {
        this.diagnostic = {
            range,
            message,
            code,
            severity: getDefaultSeverity(code),
            source: "lua",
            tags: getDiagnosticTags(code),
        };
    }

    severity(severity: DiagnosticSeverity): this {
        this.diagnostic.severity = severity;
        return this;
    }

    error(): this {
        this.diagnostic.severity = DiagnosticSeverity.Error;
        return this;
    }

    warning(): this {
        this.diagnostic.severity = DiagnosticSeverity.Warning;
        return this;
    }

    info(): this {
        this.diagnostic.severity = DiagnosticSeverity.Information;
        return this;
    }

    hint(): this {
        this.diagnostic.severity = DiagnosticSeverity.Hint;
        return this;
    }

    tag(tag: DiagnosticTag): this {
        if (!this.diagnostic.tags) {
            this.diagnostic.tags = [];
        }
        if (!this.diagnostic.tags.includes(tag)) {
            this.diagnostic.tags.push(tag);
        }
        return this;
    }

    unnecessary(): this {
        return this.tag(DiagnosticTag.Unnecessary);
    }

    deprecated(): this {
        return this.tag(DiagnosticTag.Deprecated);
    }

    relatedInfo(location: DiagnosticRelatedInformation["location"], message: string): this {
        if (!this.diagnostic.relatedInformation) {
            this.diagnostic.relatedInformation = [];
        }
        this.diagnostic.relatedInformation.push({ location, message });
        return this;
    }

    data(data: unknown): this {
        this.diagnostic.data = data;
        return this;
    }

    build(): Diagnostic {
        return this.diagnostic;
    }
}

/**
 * Create a new diagnostic builder
 */
export function diagnostic(
    range: Range,
    message: string,
    code: DiagnosticCode
): DiagnosticBuilder {
    return new DiagnosticBuilder(range, message, code);
}

// =============================================================================
// DIAGNOSTIC COLLECTOR
// =============================================================================

/**
 * Collects diagnostics during analysis
 * Similar to EmmyLua's DiagnosticIndex
 */
export class DiagnosticCollector {
    private diagnostics: Diagnostic[] = [];
    private suppressedCodes: Set<DiagnosticCode> = new Set();
    private maxDiagnosticsPerCode: Map<DiagnosticCode, number> = new Map();
    private diagnosticCounts: Map<DiagnosticCode, number> = new Map();

    /**
     * Add a diagnostic
     */
    add(diag: Diagnostic | DiagnosticBuilder): void {
        const d = diag instanceof DiagnosticBuilder ? diag.build() : diag;

        // Check suppression
        if (this.suppressedCodes.has(d.code as DiagnosticCode)) {
            return;
        }

        // Check per-code limit
        const code = d.code as DiagnosticCode;
        const maxCount = this.maxDiagnosticsPerCode.get(code);
        const currentCount = this.diagnosticCounts.get(code) ?? 0;
        if (maxCount !== undefined && currentCount >= maxCount) {
            return;
        }

        this.diagnostics.push(d);
        this.diagnosticCounts.set(code, currentCount + 1);
    }

    /**
     * Add multiple diagnostics
     */
    addAll(diagnostics: Diagnostic[]): void {
        for (const d of diagnostics) {
            this.add(d);
        }
    }

    /**
     * Suppress a diagnostic code
     */
    suppress(code: DiagnosticCode): void {
        this.suppressedCodes.add(code);
    }

    /**
     * Unsuppress a diagnostic code
     */
    unsuppress(code: DiagnosticCode): void {
        this.suppressedCodes.delete(code);
    }

    /**
     * Set max diagnostics for a specific code
     */
    setMaxForCode(code: DiagnosticCode, max: number): void {
        this.maxDiagnosticsPerCode.set(code, max);
    }

    /**
     * Get all diagnostics
     */
    getDiagnostics(): Diagnostic[] {
        return [...this.diagnostics];
    }

    /**
     * Get diagnostics by severity
     */
    getByServerity(severity: DiagnosticSeverity): Diagnostic[] {
        return this.diagnostics.filter((d) => d.severity === severity);
    }

    /**
     * Get errors only
     */
    getErrors(): Diagnostic[] {
        return this.getByServerity(DiagnosticSeverity.Error);
    }

    /**
     * Get warnings only
     */
    getWarnings(): Diagnostic[] {
        return this.getByServerity(DiagnosticSeverity.Warning);
    }

    /**
     * Check if there are any errors
     */
    hasErrors(): boolean {
        return this.diagnostics.some((d) => d.severity === DiagnosticSeverity.Error);
    }

    /**
     * Get count of diagnostics
     */
    count(): number {
        return this.diagnostics.length;
    }

    /**
     * Clear all diagnostics
     */
    clear(): void {
        this.diagnostics = [];
        this.diagnosticCounts.clear();
    }

    /**
     * Sort diagnostics by position
     */
    sort(): void {
        this.diagnostics.sort((a, b) => {
            const lineCompare = a.range.start.line - b.range.start.line;
            if (lineCompare !== 0) return lineCompare;
            return a.range.start.character - b.range.start.character;
        });
    }

    /**
     * Create common diagnostics
     */
    static createDiagnostics = {
        syntaxError(range: Range, message: string): Diagnostic {
            return diagnostic(range, message, DiagnosticCode.SyntaxError).error().build();
        },

        undefinedVariable(range: Range, name: string): Diagnostic {
            return diagnostic(
                range,
                `Undefined variable '${name}'`,
                DiagnosticCode.UndefinedVariable
            ).error().build();
        },

        undefinedField(range: Range, field: string, base: string): Diagnostic {
            return diagnostic(
                range,
                `Field '${field}' does not exist on '${base}'`,
                DiagnosticCode.UndefinedField
            ).warning().build();
        },

        unusedVariable(range: Range, name: string): Diagnostic {
            return diagnostic(
                range,
                `Variable '${name}' is declared but never used`,
                DiagnosticCode.UnusedVariable
            ).warning().unnecessary().build();
        },

        unusedParameter(range: Range, name: string): Diagnostic {
            return diagnostic(
                range,
                `Parameter '${name}' is declared but never used`,
                DiagnosticCode.UnusedParameter
            ).hint().unnecessary().build();
        },

        disabledGlobal(range: Range, name: string, suggestion?: string): Diagnostic {
            let msg = `'${name}' is disabled in the pipeline sandbox`;
            if (suggestion) {
                msg += `. ${suggestion}`;
            }
            return diagnostic(range, msg, DiagnosticCode.DisabledGlobal).error().build();
        },

        typeMismatch(range: Range, expected: string, actual: string): Diagnostic {
            return diagnostic(
                range,
                `Type mismatch: expected '${expected}', got '${actual}'`,
                DiagnosticCode.TypeMismatch
            ).error().build();
        },

        wrongArgumentCount(
            range: Range,
            expected: number | string,
            actual: number
        ): Diagnostic {
            return diagnostic(
                range,
                `Expected ${expected} argument(s), got ${actual}`,
                DiagnosticCode.WrongArgumentCount
            ).warning().build();
        },

        nilAccess(range: Range, name: string): Diagnostic {
            return diagnostic(
                range,
                `'${name}' may be nil`,
                DiagnosticCode.NilAccess
            ).warning().build();
        },

        scriptTooLarge(range: Range, size: number, maxSize: number): Diagnostic {
            return diagnostic(
                range,
                `Script size (${size} bytes) exceeds maximum (${maxSize} bytes)`,
                DiagnosticCode.ScriptTooLarge
            ).error().build();
        },

        deeplyNestedLoop(range: Range, depth: number): Diagnostic {
            return diagnostic(
                range,
                `Deeply nested loop (${depth} levels) may cause performance issues`,
                DiagnosticCode.DeeplyNestedLoop
            ).warning().build();
        },

        missingRequiredReturn(range: Range, hookType: string): Diagnostic {
            return diagnostic(
                range,
                `${hookType} hooks must return a table with 'allowed' field`,
                DiagnosticCode.MissingRequiredReturn
            ).error().build();
        },

        asyncWithoutAwait(range: Range, fnName: string): Diagnostic {
            return diagnostic(
                range,
                `'${fnName}' is async and should be wrapped with await()`,
                DiagnosticCode.AsyncWithoutAwait
            ).warning().build();
        },

        shadowedVariable(range: Range, name: string, originalRange: Range): Diagnostic {
            return diagnostic(
                range,
                `Variable '${name}' shadows a variable in an outer scope`,
                DiagnosticCode.ShadowedVariable
            )
                .warning()
                .relatedInfo(
                    { uri: "", range: originalRange },
                    `'${name}' was first declared here`
                )
                .build();
        },

        deprecatedUsage(range: Range, name: string, alternative?: string): Diagnostic {
            let msg = `'${name}' is deprecated`;
            if (alternative) {
                msg += `. Use '${alternative}' instead`;
            }
            return diagnostic(range, msg, DiagnosticCode.DeprecatedUsage)
                .hint()
                .deprecated()
                .build();
        },

        duplicateKey(range: Range, key: string): Diagnostic {
            return diagnostic(
                range,
                `Duplicate key '${key}' in table`,
                DiagnosticCode.DuplicateKey
            ).warning().build();
        },
    };
}
