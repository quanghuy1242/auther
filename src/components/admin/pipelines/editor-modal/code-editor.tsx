"use client";

import { useEffect, useRef, useMemo } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { StreamLanguage } from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { oneDark } from "@codemirror/theme-one-dark";

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    height?: string;
}

export function CodeEditor({ value, onChange, height = "400px" }: CodeEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const isUpdatingRef = useRef(false);

    // Create extensions once
    const extensions = useMemo(
        () => [
            lineNumbers(),
            highlightActiveLine(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            StreamLanguage.define(lua),
            syntaxHighlighting(defaultHighlightStyle),
            oneDark,
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
            }),
        ],
        [height, onChange]
    );

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

    return (
        <div
            ref={containerRef}
            className="grid w-full min-w-0 max-w-full border border-[#243647] rounded-lg overflow-hidden"
        />
    );
}
