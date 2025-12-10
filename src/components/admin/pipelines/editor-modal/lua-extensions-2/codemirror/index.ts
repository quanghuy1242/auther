// =============================================================================
// CODEMIRROR INTEGRATION
// =============================================================================
// CodeMirror extensions that integrate with the LSP-style handlers
// Provides autocompletion, hover, diagnostics, signature help, go-to-definition

import { autocompletion } from "@codemirror/autocomplete";
import { linter, lintGutter } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import type { HookExecutionMode } from "@/schemas/pipelines";

import { createCompletionSource } from "./completion-source";
import { createHoverTooltip } from "./hover-tooltip";
import { createSignatureHelp } from "./signature-tooltip";
import { createLinter } from "./linter-source";
import { createGotoDefinition } from "./goto-definition-source";
import { createFindReferences } from "./find-references-source";
import { createSemanticTokens } from "./semantic-tokens-source";

// =============================================================================
// CONFIGURATION OPTIONS
// =============================================================================

/**
 * Options for configuring the Lua extensions
 */
export interface LuaExtensionsOptions {
    /**
     * The name of the current hook (e.g., "before_signup").
     * Used for context-aware completions and diagnostics.
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
     * Document URI for building locations.
     * @default "file://untitled"
     */
    documentUri?: string;

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
     * Enable signature help.
     * @default true
     */
    signatureHelp?: boolean;

    /**
     * Enable go-to-definition.
     * @default true
     */
    gotoDefinition?: boolean;

    /**
     * Enable find references.
     * @default true
     */
    findReferences?: boolean;

    /**
     * Lint delay in milliseconds.
     * @default 300
     */
    lintDelay?: number;

    /**
     * Enable semantic highlighting.
     * @default true
     */
    semanticTokens?: boolean;
}

// =============================================================================
// MAIN EXTENSION FACTORY
// =============================================================================

/**
 * Creates CodeMirror extensions that integrate with the LSP-style handlers.
 *
 * Features:
 * - Autocomplete using getCompletions handler
 * - Hover tooltips using getHover handler
 * - Diagnostics using getDiagnostics handler
 * - Signature help using getSignatureHelp handler
 * - Go-to-definition using getDefinition handler
 * - Find references using getReferences handler
 *
 * @example
 * ```typescript
 * import { createLuaExtensions } from './codemirror';
 *
 * const extensions = [
 *   ...createLuaExtensions({
 *     hookName: 'before_signup',
 *     executionMode: 'blocking',
 *   }),
 * ];
 * ```
 */
export function createLuaExtensions(options: LuaExtensionsOptions = {}): Extension[] {
    const {
        hookName,
        executionMode = "blocking",
        previousScriptCode,
        documentUri = "file://untitled",
        autocomplete: enableAutocomplete = true,
        linting: enableLinting = true,
        hover: enableHover = true,
        signatureHelp: enableSignatureHelp = true,
        gotoDefinition: enableGotoDefinition = true,
        findReferences: enableFindReferences = true,
        semanticTokens: enableSemanticTokens = true,
        lintDelay = 300,
    } = options;

    const extensions: Extension[] = [];

    // Signature help (needs to be added before autocomplete for keybindings)
    if (enableSignatureHelp) {
        extensions.push(createSignatureHelp({ hookName }));
    }

    // Autocomplete extension
    if (enableAutocomplete) {
        extensions.push(
            autocompletion({
                override: [createCompletionSource({ hookName, previousScriptCode })],
                activateOnTyping: true,
                maxRenderedOptions: 50,
            })
        );
    }

    // Linting extension
    if (enableLinting) {
        extensions.push(
            linter(createLinter({ hookName, executionMode }), {
                delay: lintDelay,
            }),
            lintGutter()
        );
    }

    // Hover tooltip extension
    if (enableHover) {
        extensions.push(createHoverTooltip({ hookName }));
    }

    // Go-to-definition (Ctrl+Click)
    if (enableGotoDefinition) {
        extensions.push(createGotoDefinition({ hookName, documentUri }));
    }

    // Find references (Shift+F12)
    if (enableFindReferences) {
        extensions.push(createFindReferences({ hookName, documentUri }));
    }

    // Semantic tokens
    if (enableSemanticTokens) {
        extensions.push(createSemanticTokens({ hookName }));
    }

    return extensions;
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { createCompletionSource } from "./completion-source";
export { createHoverTooltip } from "./hover-tooltip";
export { createSignatureHelp, signatureHelpField, closeSignatureHelp } from "./signature-tooltip";
export { createLinter } from "./linter-source";
export { createGotoDefinition } from "./goto-definition-source";
export { createFindReferences } from "./find-references-source";
export { createSemanticTokens } from "./semantic-tokens-source";
export { createDocumentOutline, getFlatOutline, renderOutlineHtml } from "./document-outline";

// =============================================================================
// CSS STYLES
// =============================================================================

export const LUA_TOOLTIP_STYLES = `
/* Semantic Highlighting - VS Code Dark+ Theme Colors */
/* Force child spans (from base syntax highlighting) to inherit semantic token colors */
.cm-content [class*="cm-semantic-"] span { color: inherit !important; }

/* Core semantic tokens - VS Code Dark+ colors */
.cm-content .cm-semantic-namespace { color: #4EC9B0 !important; } /* Teal - modules/namespaces */
.cm-content .cm-semantic-type { color: #4EC9B0 !important; } /* Teal - types/classes */
.cm-content .cm-semantic-class { color: #4EC9B0 !important; } /* Teal - classes */
.cm-content .cm-semantic-parameter { color: #9CDCFE !important; font-style: italic; } /* Light blue italic - parameters */
.cm-content .cm-semantic-variable { color: #9CDCFE !important; } /* Light blue - variables */
.cm-content .cm-semantic-property { color: #9CDCFE !important; } /* Light blue - properties */
.cm-content .cm-semantic-function { color: #DCDCAA !important; } /* Yellow - functions */
.cm-content .cm-semantic-method { color: #DCDCAA !important; } /* Yellow - methods */
.cm-content .cm-semantic-keyword { color: #569CD6 !important; } /* Blue - keywords (true, false, nil, and, or, not) */
.cm-content .cm-semantic-string { color: #CE9178 !important; } /* Orange-brown - strings */
.cm-content .cm-semantic-number { color: #B5CEA8 !important; } /* Light green - numbers */
.cm-content .cm-semantic-comment { color: #6A9955 !important; } /* Green - comments */
.cm-content .cm-semantic-operator { color: #D4D4D4 !important; } /* Light gray - operators */

/* Modifiers */
.cm-content .cm-semantic-variable-readonly { color: #4FC1FF !important; } /* Bright blue - constants/readonly */
.cm-content .cm-semantic-variable-static { color: #9CDCFE !important; } /* Light blue - static variables */
.cm-content .cm-semantic-keyword-readonly { color: #569CD6 !important; } /* Blue - true/false/nil */

/* Base Lua syntax highlighting overrides - VS Code Dark+ Theme */
/* These apply when semantic tokens don't override them */
.cm-content .tok-string, .cm-content .ͼq { color: #CE9178 !important; } /* Strings - orange-brown */
.cm-content .tok-keyword, .cm-content .ͼb { color: #C586C0 !important; } /* Keywords (local, function, if, etc) - purple/magenta */
.cm-content .tok-comment, .cm-content .ͼc { color: #6A9955 !important; } /* Comments - green */
.cm-content .tok-number, .cm-content .ͼe { color: #B5CEA8 !important; } /* Numbers - light green */
.cm-content .tok-bool, .cm-content .ͼd { color: #569CD6 !important; } /* Booleans - blue */
.cm-content .tok-null { color: #569CD6 !important; } /* nil - blue */
.cm-content .tok-operator { color: #D4D4D4 !important; } /* Operators - light gray */

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
.cm-tooltip-lua-hover {
    max-width: 500px;
    padding: 8px;
    font-size: 13px;
}

.cm-tooltip-lua-hover code {
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
}

/* Signature help tooltip */
.cm-tooltip-signature-help {
    max-width: 600px;
    padding: 8px 12px;
}

.cm-tooltip-signature-help .signature-label {
    font-family: monospace;
    font-size: 13px;
}

.cm-tooltip-signature-help .active-param {
    color: #61afef;
    font-weight: 600;
}

.cm-tooltip-signature-help .signature-doc {
    margin-top: 8px;
    font-size: 12px;
    color: #abb2bf;
}

/* Reference highlights */
.cm-reference-highlight {
    background: rgba(97, 175, 239, 0.2);
    border-radius: 2px;
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

.cm-lint-marker-error {
    content: "●";
    color: #e06c75;
}

.cm-lint-marker-warning {
    content: "●";
    color: #e5c07b;
}

/* Autocomplete menu */
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

/* Document outline */
.cm-outline-item {
    padding: 2px 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
}

.cm-outline-item:hover {
    background: rgba(255, 255, 255, 0.1);
}

.cm-outline-item .icon {
    opacity: 0.7;
    font-size: 0.9em;
}

.cm-outline-item .detail {
    color: #5c6370;
    font-size: 0.9em;
}
`;
