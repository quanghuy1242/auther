"use client";

/**
 * Unified CodeEditor component with language-specific extensions.
 *
 * Supports:
 * - Lua (with LSP-style autocomplete, hover, linting, etc.)
 * - JSON (with optional JSON Schema validation/autocomplete)
 * - Custom extensions
 *
 * @example
 * ```tsx
 * // Lua
 * <CodeEditor language="lua" languageOptions={{ hookName: "before_signup" }} value={code} onChange={setCode} />
 *
 * // JSON with schema
 * <CodeEditor language="json" languageOptions={{ schema: mySchema }} value={json} onChange={setJson} />
 *
 * // Custom
 * <CodeEditor language={{ custom: [myExtension()] }} value={text} onChange={setText} />
 * ```
 */

import { useEffect, useRef, useMemo } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { StreamLanguage } from "@codemirror/language";
import { diagnosticCount } from "@codemirror/lint";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { oneDark } from "@codemirror/theme-one-dark";
import { closeBrackets, closeBracketsKeymap, completionKeymap, closeCompletion } from "@codemirror/autocomplete";

import {
    createLuaExtensions,
    createJsonExtensions,
    LUA_TOOLTIP_STYLES,
    JSON_TOOLTIP_STYLES,
    type LuaLanguageOptions,
    type JsonLanguageOptions,
} from "./extensions";

// Import signature help for ESC handling (Lua extensions)
import { signatureHelpField, closeSignatureHelp } from "./extensions/lua";

// =============================================================================
// TYPES
// =============================================================================

type LanguageConfig = "lua" | "json" | { custom: Extension[] };

export interface CodeEditorProps {
    /** Current value of the editor */
    value: string;
    /** Called when the value changes */
    onChange: (value: string) => void;
    /** Language mode or custom extensions */
    language: LanguageConfig;
    /** Language-specific options */
    languageOptions?: LuaLanguageOptions | JsonLanguageOptions;
    /** Editor height (CSS value) */
    height?: string;
    /** Whether the editor is read-only */
    readOnly?: boolean;
    /** Additional CSS class for the container */
    className?: string;
    /** Called when the error count changes (from linter diagnostics) */
    onErrorCountChange?: (errorCount: number) => void;
}

// =============================================================================
// EXTENSION FACTORY (HOF)
// =============================================================================

function createLanguageExtensions(
    language: LanguageConfig,
    options?: LuaLanguageOptions | JsonLanguageOptions
): Extension[] {
    if (language === "lua") {
        return [
            StreamLanguage.define(lua),
            ...createLuaExtensions(options as LuaLanguageOptions),
        ];
    }

    if (language === "json") {
        return createJsonExtensions(options as JsonLanguageOptions);
    }

    if (typeof language === "object" && "custom" in language) {
        return language.custom;
    }

    return [];
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CodeEditor({
    value,
    onChange,
    language,
    languageOptions,
    height = "400px",
    readOnly = false,
    className,
    onErrorCountChange,
}: CodeEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isUpdatingRef = useRef(false);

    // Create extensions with language support
    const extensions = useMemo(() => {
        const langExtensions = createLanguageExtensions(language, languageOptions);

        return [
            // Core extensions
            lineNumbers(),
            highlightActiveLine(),
            history(),
            closeBrackets(),
            bracketMatching(),
            keymap.of([
                indentWithTab,
                ...defaultKeymap,
                ...historyKeymap,
                ...closeBracketsKeymap,
                ...completionKeymap,
            ]),
            syntaxHighlighting(defaultHighlightStyle),
            oneDark,

            // Read-only state
            EditorState.readOnly.of(readOnly),

            // Language-specific extensions
            ...langExtensions,

            // Change listener
            EditorView.updateListener.of((update) => {
                if (update.docChanged && !isUpdatingRef.current) {
                    const newValue = update.state.doc.toString();
                    onChange(newValue);
                }
                // Report error count changes for diagnostics
                if (onErrorCountChange) {
                    const errorCount = diagnosticCount(update.state);
                    onErrorCountChange(errorCount);
                }
            }),

            // Theme customization
            EditorView.theme({
                "&": {
                    height,
                    width: "100%",
                    minWidth: "0",
                    maxWidth: "100%",
                    fontSize: "13px",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                },
                ".cm-scroller": {
                    overflow: "auto",
                },
                ".cm-content": {
                    padding: "12px 0",
                },
                // Lint gutter
                ".cm-gutter-lint": {
                    width: "1.2em",
                },
                ".cm-lint-marker-error": {
                    content: '"●"',
                    color: "#e06c75",
                },
                ".cm-lint-marker-warning": {
                    content: '"●"',
                    color: "#e5c07b",
                },
                // Tooltip styling
                ".cm-tooltip": {
                    backgroundColor: "#282c34",
                    border: "1px solid #3e4451",
                    borderRadius: "6px",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                },
                ".cm-tooltip-autocomplete": {
                    backgroundColor: "#282c34",
                    border: "1px solid #3e4451",
                },
                ".cm-tooltip-autocomplete > ul": {
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: "13px",
                },
                ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
                    backgroundColor: "#3e4451",
                },
                // Lint range styling
                ".cm-lintRange-error": {
                    backgroundImage: "none",
                    textDecoration: "underline wavy #e06c75",
                },
                ".cm-lintRange-warning": {
                    backgroundImage: "none",
                    textDecoration: "underline wavy #e5c07b",
                },
            }),
        ];
    }, [language, languageOptions, height, readOnly, onChange, onErrorCountChange]);

    // Inject tooltip styles
    useEffect(() => {
        const luaStyleId = "lua-tooltip-styles";
        const jsonStyleId = "json-tooltip-styles";

        if (!document.getElementById(luaStyleId)) {
            const style = document.createElement("style");
            style.id = luaStyleId;
            style.textContent = LUA_TOOLTIP_STYLES;
            document.head.appendChild(style);
        }

        if (!document.getElementById(jsonStyleId)) {
            const style = document.createElement("style");
            style.id = jsonStyleId;
            style.textContent = JSON_TOOLTIP_STYLES;
            document.head.appendChild(style);
        }
    }, []);

    // Initialize editor
    useEffect(() => {
        if (!containerRef.current) return;

        const state = EditorState.create({
            doc: value,
            extensions,
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
        // Only run on mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Update content when value changes externally
    useEffect(() => {
        if (!viewRef.current) return;

        const currentValue = viewRef.current.state.doc.toString();
        if (currentValue !== value) {
            isUpdatingRef.current = true;
            viewRef.current.dispatch({
                changes: {
                    from: 0,
                    to: currentValue.length,
                    insert: value,
                },
            });
            isUpdatingRef.current = false;
        }
    }, [value]);

    // Handle ESC key to dismiss tooltips before modal close
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleEscapeCapture = (e: KeyboardEvent) => {
            if (e.key === "Escape" && viewRef.current) {
                const view = viewRef.current;
                let handled = false;

                // Try to close autocomplete first
                const closedCompletion = closeCompletion(view);
                if (closedCompletion) {
                    handled = true;
                }

                // Try to close signature help tooltip (Lua only)
                if (signatureHelpField && closeSignatureHelp) {
                    try {
                        const sigState = view.state.field(signatureHelpField as never) as { help?: unknown } | null;
                        if (sigState && "help" in sigState && sigState.help) {
                            closeSignatureHelp(view);
                            handled = true;
                        }
                    } catch {
                        // Field not registered, ignore
                    }
                }

                // If we handled any tooltip, prevent modal from closing
                if (handled) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }
        };

        // Use capture phase to fire BEFORE Radix Dialog's handler
        container.addEventListener("keydown", handleEscapeCapture, { capture: true });
        return () => container.removeEventListener("keydown", handleEscapeCapture, { capture: true });
    }, []);

    return (
        <div
            ref={containerRef}
            className={`grid w-full min-w-0 max-w-full border border-[#243647] rounded-lg ${className ?? ""}`}
            style={{ overflow: "visible" }}
        />
    );
}
