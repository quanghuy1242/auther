// =============================================================================
// LUA EXTENSIONS - MAIN EXPORT
// =============================================================================
// Combines all Lua editor extensions into a single configurable extension

import { autocompletion } from "@codemirror/autocomplete";
import { linter, lintGutter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { HookExecutionMode } from "@/schemas/pipelines";

import { createLuaCompletionSource } from "./autocomplete";
import { createLuaLinter } from "./linter";
import { createLuaHoverTooltip } from "./hover";
import { luaSignatureHelp } from "./signature-help";
import { luaFormatter } from "./formatter";
import { luaGotoDefinition } from "./goto-definition";
import { luaFindReferences } from "./find-references";
import type { ReturnSchema } from "./type-inference";

// Re-export individual components for advanced usage
export { createLuaCompletionSource } from "./autocomplete";
export { createLuaLinter } from "./linter";
export { createLuaHoverTooltip } from "./hover";
export { luaSignatureHelp } from "./signature-help";
export { luaFormatter, formatLuaCode } from "./formatter";
export { luaGotoDefinition, findDefinitions } from "./goto-definition";
export { luaFindReferences, findAllOccurrences } from "./find-references";
export { parseLuaDocComments, type LuaDocComment, type ReturnSchema } from "./type-inference";
export * from "./definitions";

// =============================================================================
// CONFIGURATION OPTIONS
// =============================================================================

export interface LuaExtensionsOptions {
    /**
     * The name of the current hook (e.g., "before_signup").
     * Used for context-aware completions and linting.
     */
    hookName?: string;

    /**
     * The execution mode of the script.
     * Used for return type validation.
     * @default "blocking"
     */
    executionMode?: HookExecutionMode;

    /**
     * Code from the previous script layer (if any).
     * Used to infer context.prev schema for dynamic completions.
     */
    previousScriptCode?: string;

    /**
     * Enable autocomplete features.
     * @default true
     */
    autocomplete?: boolean;

    /**
     * Enable linting/diagnostics.
     * @default true
     */
    linting?: boolean;

    /**
     * Enable hover tooltips.
     * @default true
     */
    hover?: boolean;

    /**
     * Lint delay in milliseconds.
     * @default 300
     */
    lintDelay?: number;

    /**
     * Check return types based on execution mode.
     * @default true
     */
    checkReturnType?: boolean;

    /**
     * Map of script IDs to their return schemas.
     * Used for context.outputs["id"].* completions.
     */
    scriptOutputs?: Map<string, ReturnSchema>;

    /**
     * Enable go-to-definition on Ctrl+Click.
     * @default true
     */
    gotoDefinition?: boolean;

    /**
     * Enable find-references on Shift+F12.
     * @default true
     */
    findReferences?: boolean;
}

// =============================================================================
// MAIN EXTENSION FACTORY
// =============================================================================

/**
 * Creates a set of CodeMirror extensions for Lua editing in the pipeline sandbox.
 *
 * Features:
 * - Autocomplete for `helpers.*`, `context.*`, Lua keywords, and snippets
 * - Real-time syntax error detection via luaparse
 * - Detection of disabled globals (os, io, package, etc.)
 * - Return type validation based on execution mode
 * - Hover documentation for all APIs
 * - Local variable type tracking
 * - Dynamic context.prev schema inference
 *
 * @example
 * ```typescript
 * import { createLuaExtensions } from './lua-extensions';
 *
 * const extensions = [
 *   // ... other extensions
 *   ...createLuaExtensions({
 *     hookName: 'before_signup',
 *     executionMode: 'blocking',
 *     previousScriptCode: 'return { allowed = true, data = { foo = 1 } }',
 *   }),
 * ];
 * ```
 */
export function createLuaExtensions(options: LuaExtensionsOptions = {}): Extension[] {
    const {
        hookName,
        executionMode = "blocking",
        previousScriptCode,
        scriptOutputs,
        autocomplete: enableAutocomplete = true,
        linting: enableLinting = true,
        hover: enableHover = true,
        gotoDefinition: enableGotoDefinition = true,
        findReferences: enableFindReferences = true,
        lintDelay = 300,
        checkReturnType = true,
    } = options;

    const extensions: Extension[] = [];

    // Autocomplete extension
    if (enableAutocomplete) {
        extensions.push(
            autocompletion({
                override: [createLuaCompletionSource({ hookName, previousScriptCode, scriptOutputs })],
                activateOnTyping: true,
                maxRenderedOptions: 50,
            }),
            // Signature help for function parameters
            luaSignatureHelp()
        );
    }

    // Linting extension
    if (enableLinting) {
        extensions.push(
            linter(createLuaLinter({ executionMode, checkReturnType }), {
                delay: lintDelay,
            }),
            lintGutter()
        );
    }

    // Hover tooltip extension
    if (enableHover) {
        extensions.push(createLuaHoverTooltip({ hookName }));
    }

    // Formatter extension (Ctrl+Shift+F)
    extensions.push(luaFormatter());

    // Go to definition (Ctrl+Click)
    if (enableGotoDefinition) {
        extensions.push(luaGotoDefinition());
    }

    // Find references (Shift+F12)
    if (enableFindReferences) {
        extensions.push(luaFindReferences());
    }

    return extensions;
}

// =============================================================================
// CSS STYLES FOR TOOLTIPS
// =============================================================================

/**
 * CSS styles for Lua tooltips. Add to your global styles or inject dynamically.
 */
export const LUA_TOOLTIP_STYLES = `
/* Lua completion info panel */
.cm-completion-info-lua {
    padding: 8px;
    max-width: 400px;
    font-size: 13px;
    line-height: 1.4;
}

.cm-completion-info-lua code {
    background: rgba(0, 0, 0, 0.2);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
}

/* Lua hover tooltip */
.cm-tooltip-lua-hover code {
    background: rgba(0, 0, 0, 0.2);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
}

/* Lint diagnostics */
.cm-lintRange-error {
    background: rgba(224, 108, 117, 0.2);
    text-decoration: underline wavy #e06c75;
}

.cm-lintRange-warning {
    background: rgba(229, 192, 123, 0.15);
    text-decoration: underline wavy #e5c07b;
}

/* Lint gutter */
.cm-lint-marker-error {
    content: "●";
    color: #e06c75;
}

.cm-lint-marker-warning {
    content: "●";
    color: #e5c07b;
}

/* Autocomplete menu styling */
.cm-tooltip-autocomplete {
    background: #282c34 !important;
    border: 1px solid #3e4451 !important;
}

.cm-tooltip-autocomplete .cm-completionLabel {
    color: #abb2bf;
}

.cm-tooltip-autocomplete .cm-completionDetail {
    color: #5c6370;
    font-style: italic;
}

.cm-tooltip-autocomplete li[aria-selected] {
    background: #3e4451 !important;
}

.cm-tooltip-autocomplete .cm-completionIcon-function {
    color: #61afef;
}

.cm-tooltip-autocomplete .cm-completionIcon-property {
    color: #e5c07b;
}

.cm-tooltip-autocomplete .cm-completionIcon-keyword {
    color: #c678dd;
}

.cm-tooltip-autocomplete .cm-completionIcon-variable {
    color: #98c379;
}
`;
