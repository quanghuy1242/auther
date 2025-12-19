import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { CompletionTriggerStatus } from "../types";
import { LuaTypeKind } from "../../../analysis/type-system";
import { getDefinitionLoader, type TableDefinition } from "../../../definitions/definition-loader";

// -----------------------------------------------------------------------------
// POSTFIX PROVIDER (for .if, .while, .forp, etc.)
// -----------------------------------------------------------------------------

/**
 * Provides postfix completions that transform expressions
 * Following EmmyLua's postfix_provider.rs
 * Example: typing `x.if` becomes `if x then ... end`
 */
export class PostfixProvider implements CompletionProvider {
    private readonly postfixSnippets = [
        { label: "if", template: (expr: string) => `if ${expr} then\n\t$0\nend`, detail: "if expr then ... end" },
        { label: "ifn", template: (expr: string) => `if not ${expr} then\n\t$0\nend`, detail: "if not expr then ... end" },
        { label: "while", template: (expr: string) => `while ${expr} do\n\t$0\nend`, detail: "while expr do ... end" },
        { label: "forp", template: (expr: string) => `for \${1:k}, \${2:v} in pairs(${expr}) do\n\t$0\nend`, detail: "for k, v in pairs(expr) do ... end" },
        { label: "forip", template: (expr: string) => `for \${1:i}, \${2:v} in ipairs(${expr}) do\n\t$0\nend`, detail: "for i, v in ipairs(expr) do ... end" },
        { label: "fori", template: (expr: string) => `for \${1:i} = 1, ${expr} do\n\t$0\nend`, detail: "for i = 1, expr do ... end" },
        { label: "insert", template: (expr: string) => `table.insert(${expr}, \${1:value})`, detail: "table.insert(expr, value)" },
        { label: "remove", template: (expr: string) => `table.remove(${expr}, \${1:index})`, detail: "table.remove(expr, index)" },
        { label: "++", template: (expr: string) => `${expr} = ${expr} + 1`, detail: "expr = expr + 1" },
        { label: "--", template: (expr: string) => `${expr} = ${expr} - 1`, detail: "expr = expr - 1" },
        { label: "+n", template: (expr: string) => `${expr} = ${expr} + $1`, detail: "expr = expr + n" },
        { label: "-n", template: (expr: string) => `${expr} = ${expr} - $1`, detail: "expr = expr - n" },
    ];

    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.Dot) return;

        // Get the expression before the dot
        const leftExprInfo = this.getLeftExpressionText(builder);
        if (!leftExprInfo) return;

        const { exprText, replaceStart } = leftExprInfo;

        // Skip if expression resolves to a table type with members (member access takes priority)
        if (this.shouldSkipPostfix(builder, exprText)) return;

        // Add postfix completions
        for (const { label, template, detail } of this.postfixSnippets) {
            const insertText = template(exprText);
            builder.addItem({
                label,
                kind: 15, // Snippet
                detail: `→ ${detail}`,
                insertText,
                insertTextFormat: 2, // Snippet
                // The completion replaces from expression start through the dot
                textEdit: {
                    range: {
                        start: builder.document.offsetToPosition(replaceStart),
                        end: builder.position,
                    },
                    newText: insertText,
                },
            });
        }
    }

    private getLeftExpressionText(builder: CompletionBuilder): { exprText: string; replaceStart: number } | null {
        // Get line text before cursor
        const line = builder.document.getLine(builder.position.line);
        const textBeforeCursor = line.slice(0, builder.position.character);

        // Check if there's a dot right before cursor (the postfix trigger)
        if (!textBeforeCursor.endsWith(".")) return null;

        const lineWithoutDot = textBeforeCursor.slice(0, -1);

        // Match identifier chain (a.b.c or just a)
        const match = lineWithoutDot.match(/([a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*$/);
        if (!match) return null;

        const exprText = match[1];
        const exprStart = lineWithoutDot.length - match[0].trimEnd().length + (match[0].length - match[0].trimStart().length);
        const lineStartOffset = builder.document.positionToOffset({ line: builder.position.line, character: 0 });

        return {
            exprText,
            replaceStart: lineStartOffset + exprStart,
        };
    }

    private shouldSkipPostfix(builder: CompletionBuilder, exprText: string): boolean {
        // If the expression is a known table/object with members, skip postfix
        // to allow member completion to take over
        const definitionLoader = getDefinitionLoader();
        const parts = exprText.split(".");
        const rootName = parts[0];

        // Check if it's a sandbox item with fields (like helpers, context)
        const sandboxItem = definitionLoader.getSandboxItem(rootName);
        if (sandboxItem && (sandboxItem as TableDefinition).fields) {
            return true;
        }

        // Check if it's a library (string, math, table, etc.)
        // Port from EmmyLua: skip postfix for libraries with member completions
        if (definitionLoader.getLibrary(rootName)) {
            return true;
        }

        // Check symbol table for table types
        const symbol = builder.analysisResult.symbolTable.lookupSymbol(rootName, builder.offset);
        if (symbol && symbol.type.kind === LuaTypeKind.TableType) {
            return true;
        }

        return false;
    }
}
