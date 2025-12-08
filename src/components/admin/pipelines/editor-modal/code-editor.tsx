"use client";

import { useEffect, useRef, useMemo } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language";
import { StreamLanguage } from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { oneDark } from "@codemirror/theme-one-dark";
import { closeBrackets, closeBracketsKeymap, completionKeymap, closeCompletion } from "@codemirror/autocomplete";
import type { HookExecutionMode } from "@/schemas/pipelines";
import { createLuaExtensions, LUA_TOOLTIP_STYLES } from "./lua-extensions";

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    height?: string;
    /**
     * The name of the current hook (e.g., "before_signup").
     * Used for context-aware completions.
     */
    hookName?: string;
    /**
     * The execution mode of the script.
     * Used for return type validation.
     */
    executionMode?: HookExecutionMode;
    /**
     * Code from the previous script layer (if any).
     * Used for dynamic context.prev schema inference.
     */
    previousScriptCode?: string;
}

export function CodeEditor({
    value,
    onChange,
    height = "400px",
    hookName,
    executionMode = "blocking",
    previousScriptCode,
}: CodeEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isUpdatingRef = useRef(false);

    // Create extensions once, including Lua intelligence
    const extensions = useMemo(
        () => [
            lineNumbers(),
            highlightActiveLine(),
            history(),
            closeBrackets(),
            bracketMatching(),
            keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap, ...completionKeymap]),
            StreamLanguage.define(lua),
            syntaxHighlighting(defaultHighlightStyle),
            oneDark,
            // Lua intelligence extensions
            ...createLuaExtensions({
                hookName,
                executionMode,
                previousScriptCode,
                autocomplete: true,
                linting: true,
                hover: true,
                lintDelay: 300,
                checkReturnType: true,
            }),
            EditorView.updateListener.of((update) => {
                if (update.docChanged && !isUpdatingRef.current) {
                    const newValue = update.state.doc.toString();
                    onChange(newValue);
                }
            }),
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
                ".cm-line": {
                    padding: "0 12px",
                },
                // Lint gutter styling
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
        ],
        [height, onChange, hookName, executionMode, previousScriptCode]
    );

    // Inject tooltip styles
    useEffect(() => {
        const styleId = "lua-tooltip-styles";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = LUA_TOOLTIP_STYLES;
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

    // Handle ESC key to dismiss CodeMirror autocomplete/tooltips before modal
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleEscapeCapture = (e: KeyboardEvent) => {
            if (e.key === "Escape" && viewRef.current) {
                // Check if there's an open tooltip/autocomplete
                const hasOpenTooltip = document.querySelector(".cm-tooltip, .cm-tooltip-autocomplete");
                if (hasOpenTooltip) {
                    // Programmatically close the completion
                    const closed = closeCompletion(viewRef.current);
                    if (closed) {
                        // Prevent modal from closing since we handled the ESC
                        e.stopPropagation();
                        e.preventDefault();
                    }
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
            className="grid w-full min-w-0 max-w-full border border-[#243647] rounded-lg"
            style={{ overflow: "visible" }}
        />
    );
}
