// =============================================================================
// GO TO DEFINITION
// =============================================================================
// Ctrl+Click to jump to local variable declaration

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { resolveNodeAtPosition } from "./type-inference";

// =============================================================================
// GO TO DEFINITION EXTENSION
// =============================================================================

/**
 * Jump to the definition of a local variable or function.
 * Triggered by Ctrl+Click (Cmd+Click on Mac).
 */
export function luaGotoDefinition(): Extension {
    return EditorView.domEventHandlers({
        click(event: MouseEvent, view: EditorView) {
            // Check for Ctrl+Click (or Cmd+Click on Mac)
            if (!event.ctrlKey && !event.metaKey) return false;

            // Get position in document
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) return false;

            const code = view.state.doc.toString();

            // Resolve node at position using unified inference
            const resolved = resolveNodeAtPosition(code, pos);
            if (!resolved) return false;

            const { node, scope } = resolved;

            // We only care about Identifiers
            if (node.type !== "Identifier") return false;

            // Don't jump for keywords (though parser usually classifies them as Keywords, not Identifiers)
            // But 'local' etc are reserved.

            // Look up in scope
            if (!scope) return false;

            const variable = scope.get(node.name);
            if (!variable) return false;

            // Check if it has a valid declaration location
            // We assume 'line' is 1-based.
            // If initNode exists, use its location for better precision (column)
            let line = variable.line;
            let col = 0;

            if (variable.initNode && variable.initNode.loc) {
                line = variable.initNode.loc.start.line;
                col = variable.initNode.loc.start.column;
            }

            // Don't jump if we are already at the definition
            // (e.g. clicking the declaration itself)
            // Check if pos is within definition range
            if (variable.initNode && variable.initNode.range) {
                const [start, end] = variable.initNode.range;
                if (pos >= start && pos <= end) return false;
            } else {
                const currentLine = view.state.doc.lineAt(pos);
                if (currentLine.number === line) return false;
            }

            // Jump to definition
            // Ensure line is within bounds
            if (line < 1 || line > view.state.doc.lines) return false;

            const targetLine = view.state.doc.line(line);
            const targetPos = targetLine.from + col;

            view.dispatch({
                selection: { anchor: targetPos },
                scrollIntoView: true,
            });

            // Prevent default click behavior
            event.preventDefault();
            return true;
        },
    });
}
