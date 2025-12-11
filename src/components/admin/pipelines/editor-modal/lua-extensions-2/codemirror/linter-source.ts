// =============================================================================
// LINTER SOURCE
// =============================================================================
// CodeMirror linter that uses the LSP-style getDiagnostics handler

import type { Diagnostic as CMLintDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type { HookExecutionMode } from "@/schemas/pipelines";

import { LuaDocument } from "../core/document";
import { analyzeDocument } from "../analysis/analyzer";
import { getDiagnostics } from "../handlers/diagnostics";
import { DiagnosticSeverity, type Diagnostic } from "../protocol";

// =============================================================================
// OPTIONS
// =============================================================================

export interface LinterOptions {
    /** Current hook name for context-aware diagnostics */
    hookName?: string;
    /** Execution mode for return type validation */
    executionMode?: HookExecutionMode;
    /** Document URI */
    documentUri?: string;
}

// =============================================================================
// SEVERITY CONVERSION
// =============================================================================

/**
 * Map LSP DiagnosticSeverity to CodeMirror lint severity
 */
function toCodeMirrorSeverity(
    severity: DiagnosticSeverity | undefined
): "error" | "warning" | "info" | "hint" {
    switch (severity) {
        case DiagnosticSeverity.Error:
            return "error";
        case DiagnosticSeverity.Warning:
            return "warning";
        case DiagnosticSeverity.Information:
            return "info";
        case DiagnosticSeverity.Hint:
            return "hint";
        default:
            return "warning";
    }
}

// =============================================================================
// DIAGNOSTIC CONVERSION
// =============================================================================

/**
 * Convert LSP Diagnostic to CodeMirror Diagnostic
 */
function toCodeMirrorDiagnostic(
    diagnostic: Diagnostic,
    luaDoc: LuaDocument
): CMLintDiagnostic {
    const from = luaDoc.positionToOffset(diagnostic.range.start);
    const to = luaDoc.positionToOffset(diagnostic.range.end);

    return {
        from,
        to: Math.max(to, from + 1), // Ensure at least 1 character range
        severity: toCodeMirrorSeverity(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source ?? "lua",
    };
}

// =============================================================================
// LINTER FACTORY
// =============================================================================

/**
 * Create a CodeMirror linter using the LSP-style handler
 */
export function createLinter(
    options: LinterOptions = {}
): (view: EditorView) => CMLintDiagnostic[] {
    const { hookName, executionMode = "blocking", documentUri = "file://untitled" } = options;

    return (view: EditorView): CMLintDiagnostic[] => {
        const code = view.state.doc.toString();

        // Create document and analyze
        const luaDoc = new LuaDocument(documentUri, code);
        const analysisResult = analyzeDocument(luaDoc, { hookName });

        // Get diagnostics from handler
        const diagnostics = getDiagnostics(luaDoc, analysisResult, {
            hookName,
            executionMode,
        });

        // Convert to CodeMirror format
        return diagnostics.map((d) => toCodeMirrorDiagnostic(d, luaDoc));
    };
}
