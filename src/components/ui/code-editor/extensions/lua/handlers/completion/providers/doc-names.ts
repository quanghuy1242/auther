import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { isIdentifier, type LuaFunctionDeclaration, type LuaIdentifier, type LuaLocalStatement, type LuaFunctionExpression } from "../../../core/luaparse-types";

// -----------------------------------------------------------------------------
// DOC NAME TOKEN PROVIDER (for param name completions in annotations)
// -----------------------------------------------------------------------------

/**
 * Provides parameter name completions in ---@param annotations
 * Following EmmyLua's doc_name_token_provider.rs
 */
export class DocNameTokenProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        // Check if we're after ---@param
        if (!this.isAfterParamTag(builder)) return;

        // Find function parameters from the following function
        const params = this.findFunctionParams(builder);
        for (const param of params) {
            builder.addItem({
                label: param,
                kind: 6, // Variable
                detail: "(parameter)",
            });
        }

        builder.stopHere();
    }

    private isAfterParamTag(builder: CompletionBuilder): boolean {
        const line = builder.document.getLine(builder.position.line);
        const textBefore = line.slice(0, builder.position.character);

        // After ---@param with optional partial name
        return /---@param\s+[\w]*$/.test(textBefore);
    }

    private findFunctionParams(builder: CompletionBuilder): string[] {
        const params: string[] = [];
        const ast = builder.document.getAST();
        if (!ast) return params;

        // Look for function declaration after the current line
        const docOffset = builder.offset;

        // Simple heuristic: look for FunctionDeclaration after current position
        // Search forward in the document for a function
        for (const stmt of ast.body) {
            if (stmt.range && stmt.range[0] > docOffset) {
                if (stmt.type === "FunctionDeclaration") {
                    const funcDecl = stmt as LuaFunctionDeclaration;
                    for (const p of funcDecl.parameters) {
                        if (isIdentifier(p)) {
                            params.push((p as LuaIdentifier).name);
                        }
                    }
                    break;
                }
                if (stmt.type === "LocalStatement") {
                    const localStmt = stmt as LuaLocalStatement;
                    if (localStmt.init.length > 0 && localStmt.init[0].type === "FunctionExpression") {
                        const funcExpr = localStmt.init[0] as LuaFunctionExpression;
                        for (const p of funcExpr.parameters) {
                            if (isIdentifier(p)) {
                                params.push((p as LuaIdentifier).name);
                            }
                        }
                        break;
                    }
                }
            }
        }

        return params;
    }
}
