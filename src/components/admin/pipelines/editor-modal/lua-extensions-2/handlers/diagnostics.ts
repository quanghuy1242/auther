// =============================================================================
// DIAGNOSTICS HANDLER
// =============================================================================
// Provides diagnostics (linting) for the Lua editor
// Inspired by EmmyLua's handlers/diagnostic module structure
// See: emmylua_ls/src/handlers/diagnostic/

import type { Diagnostic, Range } from "../protocol";
import { DiagnosticSeverity, createRange } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import { analyzeDocument, type AnalyzerOptions } from "../analysis/analyzer";
import { DiagnosticCode } from "../analysis/diagnostics";
import { getDefinitionLoader } from "../definitions/definition-loader";
import { walkAST, isReturnStatement, isIdentifier, isMemberExpression, isCallExpression } from "../core/luaparse-types";
import type { LuaChunk, LuaReturnStatement, LuaNode, LuaIdentifier, LuaMemberExpression, LuaCallExpression } from "../core/luaparse-types";
import { SymbolKind } from "../analysis/symbol-table";
import { LuaTypeKind, type LuaType, type LuaTableType, type LuaFunctionType } from "../analysis/type-system";

// =============================================================================
// DIAGNOSTIC OPTIONS
// =============================================================================

/**
 * Options for diagnostic collection
 */
export interface DiagnosticOptions {
    /** Current hook name for context-aware diagnostics */
    hookName?: string;
    /** Execution mode (determines required return structure) */
    executionMode?: "sequential" | "parallel";
    /** Maximum script size in bytes */
    maxScriptSize?: number;
    /** Maximum depth before warning about nested loops */
    maxLoopDepth?: number;
    /** Whether to include hints */
    includeHints?: boolean;
    /** Diagnostic codes to suppress */
    suppressedCodes?: DiagnosticCode[];
    /** Maximum number of diagnostics per code */
    maxPerCode?: number;
}

const DEFAULT_OPTIONS: Required<DiagnosticOptions> = {
    hookName: "",
    executionMode: "sequential",
    maxScriptSize: 50 * 1024, // 50KB
    maxLoopDepth: 4,
    includeHints: true,
    suppressedCodes: [],
    maxPerCode: 10,
};

// =============================================================================
// DIAGNOSTIC PROVIDERS
// =============================================================================

/**
 * Provider interface for diagnostic checks
 * Following EmmyLua's modular diagnostic approach
 */
interface DiagnosticProvider {
    provide(context: DiagnosticContext): Diagnostic[];
}

/**
 * Context for diagnostic providers
 */
interface DiagnosticContext {
    document: LuaDocument;
    analysisResult: AnalysisResult;
    options: Required<DiagnosticOptions>;
}

// -----------------------------------------------------------------------------
// SCRIPT SIZE PROVIDER
// -----------------------------------------------------------------------------

/**
 * Checks if script exceeds size limits
 */
class ScriptSizeProvider implements DiagnosticProvider {
    provide(context: DiagnosticContext): Diagnostic[] {
        const text = context.document.getText();
        const maxSize = context.options.maxScriptSize;

        if (text.length > maxSize) {
            return [{
                range: createRange(
                    { line: 0, character: 0 },
                    { line: 0, character: 0 }
                ),
                severity: DiagnosticSeverity.Warning,
                code: DiagnosticCode.ScriptTooLarge,
                source: "lua",
                message: `Script size (${(text.length / 1024).toFixed(1)}KB) exceeds recommended limit (${(maxSize / 1024).toFixed(0)}KB)`,
            }];
        }

        return [];
    }
}

// -----------------------------------------------------------------------------
// DISABLED GLOBAL PROVIDER
// -----------------------------------------------------------------------------

/**
 * Checks for usage of disabled global variables
 */
class DisabledGlobalProvider implements DiagnosticProvider {
    provide(context: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const definitionLoader = getDefinitionLoader();
        const ast = context.document.getAST();
        if (!ast) return diagnostics;

        // Walk the AST looking for identifiers that are disabled globals
        walkAST(ast, (node: LuaNode, _parent: LuaNode | null) => {
            if (isIdentifier(node)) {
                const ident = node as LuaIdentifier;
                const name = ident.name;

                // Skip if this is a local/known symbol
                const symbol = context.analysisResult.symbolTable.lookupSymbol(name, ident.range?.[0]);
                if (symbol && symbol.kind !== SymbolKind.Global) {
                    return;
                }

                // Check if it's a disabled global
                if (definitionLoader.isDisabled(name)) {
                    const message = definitionLoader.getDisabledMessage(name) ?? `'${name}' is disabled in the sandbox`;
                    if (ident.range) {
                        diagnostics.push({
                            range: context.document.offsetRangeToRange(ident.range[0], ident.range[1]),
                            severity: DiagnosticSeverity.Error,
                            code: DiagnosticCode.DisabledGlobal,
                            source: "lua",
                            message,
                        });
                    }
                }
            }
        });

        return diagnostics;
    }
}

// -----------------------------------------------------------------------------
// RETURN VALIDATION PROVIDER
// -----------------------------------------------------------------------------

/**
 * Validates return statements based on execution mode
 */
class ReturnValidationProvider implements DiagnosticProvider {
    provide(context: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const ast = context.document.getAST();
        if (!ast) return diagnostics;

        const executionMode = context.options.executionMode;
        const definitionLoader = getDefinitionLoader();
        const returnInfo = definitionLoader.getReturnTypeInfo(executionMode);

        if (!returnInfo) return diagnostics;

        // Find all return statements at the top level
        const topLevelReturns = this.findTopLevelReturns(ast);

        if (topLevelReturns.length === 0) {
            // No return statement - may be required
            if (returnInfo.requiredFields.length > 0) {
                diagnostics.push({
                    range: createRange(
                        { line: context.document.getLineCount() - 1, character: 0 },
                        { line: context.document.getLineCount() - 1, character: 0 }
                    ),
                    severity: DiagnosticSeverity.Warning,
                    code: DiagnosticCode.MissingRequiredReturn,
                    source: "lua",
                    message: `Script should return a table with required fields: ${returnInfo.requiredFields.join(", ")}`,
                });
            }
        }

        // Validate return structure (basic check)
        for (const ret of topLevelReturns) {
            if (ret.arguments.length === 0) {
                diagnostics.push({
                    range: this.getReturnRange(context.document, ret),
                    severity: DiagnosticSeverity.Warning,
                    code: DiagnosticCode.InvalidReturnFormat,
                    source: "lua",
                    message: `Return statement should return a table with: ${returnInfo.requiredFields.join(", ")}`,
                });
            }
        }

        return diagnostics;
    }

    private findTopLevelReturns(ast: LuaChunk): LuaReturnStatement[] {
        const returns: LuaReturnStatement[] = [];

        for (const stmt of ast.body) {
            if (isReturnStatement(stmt)) {
                returns.push(stmt as LuaReturnStatement);
            }
        }

        return returns;
    }

    private getReturnRange(document: LuaDocument, ret: LuaReturnStatement): Range {
        if (ret.range) {
            return document.offsetRangeToRange(ret.range[0], ret.range[1]);
        }
        return createRange({ line: 0, character: 0 }, { line: 0, character: 0 });
    }
}

// -----------------------------------------------------------------------------
// NESTED LOOP PROVIDER
// -----------------------------------------------------------------------------

/**
 * Warns about deeply nested loops
 */
class NestedLoopProvider implements DiagnosticProvider {
    private readonly loopTypes = new Set(["WhileStatement", "ForNumericStatement", "ForGenericStatement", "RepeatStatement"]);

    provide(context: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const ast = context.document.getAST();
        if (!ast) return diagnostics;

        const maxDepth = context.options.maxLoopDepth;

        // Track current loop depth during traversal
        this.checkNested(ast.body, context.document, diagnostics, 0, maxDepth);

        return diagnostics;
    }

    private checkNested(
        statements: LuaNode[],
        document: LuaDocument,
        diagnostics: Diagnostic[],
        currentDepth: number,
        maxDepth: number
    ): void {
        for (const stmt of statements) {
            if (this.loopTypes.has(stmt.type)) {
                const newDepth = currentDepth + 1;

                if (newDepth >= maxDepth) {
                    const range = stmt.range
                        ? document.offsetRangeToRange(stmt.range[0], stmt.range[1])
                        : createRange({ line: 0, character: 0 }, { line: 0, character: 0 });

                    diagnostics.push({
                        range,
                        severity: DiagnosticSeverity.Warning,
                        code: DiagnosticCode.DeeplyNestedLoop,
                        source: "lua",
                        message: `Deeply nested loop (depth: ${newDepth}). Consider refactoring to avoid performance issues.`,
                    });
                }

                // Check body of the loop
                const body = (stmt as unknown as { body?: LuaNode[] }).body;
                if (body) {
                    this.checkNested(body, document, diagnostics, newDepth, maxDepth);
                }
            } else {
                // Check other block structures
                const body = (stmt as unknown as { body?: LuaNode[] }).body;
                if (body) {
                    this.checkNested(body, document, diagnostics, currentDepth, maxDepth);
                }

                // Check if clauses
                const clauses = (stmt as unknown as { clauses?: Array<{ body?: LuaNode[] }> }).clauses;
                if (clauses) {
                    for (const clause of clauses) {
                        if (clause.body) {
                            this.checkNested(clause.body, document, diagnostics, currentDepth, maxDepth);
                        }
                    }
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// ASYNC USAGE PROVIDER
// -----------------------------------------------------------------------------
// ASYNC USAGE PROVIDER
// -----------------------------------------------------------------------------

/**
 * Checks for async operations without await
 */
class AsyncUsageProvider implements DiagnosticProvider {
    provide(_context: DiagnosticContext): Diagnostic[] {
        // This would require more sophisticated analysis to track
        // whether async calls are properly awaited
        // For now, this is a placeholder
        return [];
    }
}

// -----------------------------------------------------------------------------
// FIELD VALIDATION PROVIDER (Phase F Item 11)
// -----------------------------------------------------------------------------

/**
 * Validates field access on typed objects
 * Warns when accessing undefined fields
 */
class FieldValidationProvider implements DiagnosticProvider {
    provide(context: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const ast = context.document.getAST();
        if (!ast) return diagnostics;

        walkAST(ast, (node: LuaNode, _parent: LuaNode | null) => {
            if (isMemberExpression(node)) {
                const memberExpr = node as LuaMemberExpression;
                const fieldName = memberExpr.identifier?.name;
                if (!fieldName || !memberExpr.base?.range) return;

                // Get the type of the base expression
                const baseType = context.analysisResult.types.get(memberExpr.base.range[0]);
                if (!baseType || baseType.kind !== LuaTypeKind.Table) return;

                const tableType = baseType as unknown as LuaTableType;
                if (!tableType.fields) return;

                // Check if field exists
                if (!tableType.fields.has(fieldName)) {
                    const range = memberExpr.identifier.range;
                    if (range) {
                        diagnostics.push({
                            range: context.document.offsetRangeToRange(range[0], range[1]),
                            severity: DiagnosticSeverity.Warning,
                            code: DiagnosticCode.UndefinedField,
                            source: "lua",
                            message: `Field '${fieldName}' does not exist on this type`,
                        });
                    }
                }
            }
        });

        return diagnostics;
    }
}

// -----------------------------------------------------------------------------
// ARGUMENT COUNT PROVIDER (Phase F Item 12)
// -----------------------------------------------------------------------------

/**
 * Validates function call argument counts
 * Checks if call has correct number of arguments
 */
class ArgumentCountProvider implements DiagnosticProvider {
    provide(context: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const ast = context.document.getAST();
        if (!ast) return diagnostics;

        walkAST(ast, (node: LuaNode, _parent: LuaNode | null) => {
            if (isCallExpression(node)) {
                const callExpr = node as LuaCallExpression;
                if (!callExpr.base?.range) return;

                // Get the type of the function being called
                const fnType = context.analysisResult.types.get(callExpr.base.range[0]);
                if (!fnType || fnType.kind !== LuaTypeKind.FunctionType) return;

                const funcType = fnType as LuaFunctionType;
                
                // Check overloads if available (Phase E integration)
                const signatures = funcType.overloads ? [funcType, ...funcType.overloads] : [funcType];
                
                const argCount = callExpr.arguments?.length ?? 0;
                let matchesAnySignature = false;

                for (const sig of signatures) {
                    const requiredParams = sig.params.filter(p => !p.optional).length;
                    const totalParams = sig.params.length;
                    const hasVariadic = sig.params.some(p => p.vararg);

                    if (hasVariadic) {
                        // With variadic, any count >= required is ok
                        if (argCount >= requiredParams) {
                            matchesAnySignature = true;
                            break;
                        }
                    } else {
                        // Check if arg count is within range
                        if (argCount >= requiredParams && argCount <= totalParams) {
                            matchesAnySignature = true;
                            break;
                        }
                    }
                }

                if (!matchesAnySignature && callExpr.range) {
                    const funcType = fnType as LuaFunctionType;
                    const expected = funcType.params.filter(p => !p.optional).length;
                    diagnostics.push({
                        range: context.document.offsetRangeToRange(callExpr.range[0], callExpr.range[1]),
                        severity: DiagnosticSeverity.Error,
                        code: DiagnosticCode.WrongArgumentCount,
                        source: "lua",
                        message: `Expected ${expected} argument(s), but got ${argCount}`,
                    });
                }
            }
        });

        return diagnostics;
    }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Main diagnostics handler following EmmyLua's on_pull_document_diagnostic pattern
 */
export function getDiagnostics(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    options: DiagnosticOptions = {}
): Diagnostic[] {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    // Start with diagnostics from analysis
    const diagnostics: Diagnostic[] = [...analysisResult.diagnostics.getDiagnostics()];

    // Create context
    const context: DiagnosticContext = {
        document,
        analysisResult,
        options: mergedOptions,
    };

    // Run additional providers
    const providers: DiagnosticProvider[] = [
        new ScriptSizeProvider(),
        new DisabledGlobalProvider(),
        new ReturnValidationProvider(),
        new NestedLoopProvider(),
        new AsyncUsageProvider(),
        new FieldValidationProvider(),      // Phase F Item 11
        new ArgumentCountProvider(),        // Phase F Item 12
    ];

    for (const provider of providers) {
        const providerDiagnostics = provider.provide(context);
        diagnostics.push(...providerDiagnostics);
    }

    // Filter suppressed codes
    const filtered = diagnostics.filter((d) => {
        if (typeof d.code === "number" && mergedOptions.suppressedCodes.includes(d.code)) {
            return false;
        }
        return true;
    });

    // Filter by severity (exclude hints if not wanted)
    const severityFiltered = mergedOptions.includeHints
        ? filtered
        : filtered.filter((d) => d.severity !== DiagnosticSeverity.Hint);

    // Apply max per code limit
    const codeCount = new Map<number | string, number>();
    const limited = severityFiltered.filter((d) => {
        if (!d.code) return true;
        const count = codeCount.get(d.code) ?? 0;
        if (count >= mergedOptions.maxPerCode) return false;
        codeCount.set(d.code, count + 1);
        return true;
    });

    return limited;
}

/**
 * Analyze and get diagnostics in one call
 */
export function analyzeAndGetDiagnostics(
    document: LuaDocument,
    analyzerOptions: AnalyzerOptions = {},
    diagnosticOptions: DiagnosticOptions = {}
): Diagnostic[] {
    const analysisResult = analyzeDocument(document, analyzerOptions);
    return getDiagnostics(document, analysisResult, diagnosticOptions);
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
    DiagnosticProvider,
    DiagnosticContext,
};

export {
    ScriptSizeProvider,
    DisabledGlobalProvider,
    ReturnValidationProvider,
    NestedLoopProvider,
    AsyncUsageProvider,
    FieldValidationProvider,
    ArgumentCountProvider,
};
