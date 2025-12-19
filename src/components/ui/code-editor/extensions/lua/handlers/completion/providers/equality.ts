import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { CompletionTriggerStatus } from "../types";
import type { LuaType, LuaRefType } from "../../../analysis/type-system";
import { LuaTypeKind } from "../../../analysis/type-system";
import { findNodePathAtOffset, isIdentifier, type LuaBinaryExpression, type LuaExpression, type LuaIdentifier } from "../../../core/luaparse-types";
import { getDefinitionLoader } from "../../../definitions/definition-loader";

// -----------------------------------------------------------------------------
// EQUALITY PROVIDER (for x == / x ~= type-aware completions)
// -----------------------------------------------------------------------------

/**
 * Provides type-aware completions after == or ~= operators
 * Following EmmyLua's equality_provider.rs
 */
export class EqualityProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.General) return;

        const expectedType = this.getExpectedType(builder);
        if (!expectedType) return;

        this.dispatchTypeCompletions(builder, expectedType);
    }

    private getExpectedType(builder: CompletionBuilder): LuaType | null {
        const ast = builder.document.getAST();
        if (!ast) return null;

        const nodePath = findNodePathAtOffset(ast, builder.offset);

        // Look for BinaryExpression with == or ~=
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];
            if (node.type === "BinaryExpression") {
                const binExpr = node as LuaBinaryExpression;
                if (binExpr.operator === "==" || binExpr.operator === "~=") {
                    // Infer type of left side
                    const leftType = this.inferExprType(builder, binExpr.left);
                    if (leftType && leftType.kind !== LuaTypeKind.Unknown) {
                        return leftType;
                    }
                }
            }
        }

        return null;
    }

    private inferExprType(builder: CompletionBuilder, expr: LuaExpression): LuaType | null {
        if (!expr.range) return null;

        const cached = builder.analysisResult.types.get(expr.range[0]);
        if (cached) return cached;

        if (isIdentifier(expr)) {
            const symbol = builder.analysisResult.symbolTable.lookupSymbol(
                (expr as LuaIdentifier).name,
                builder.offset
            );
            if (symbol) return symbol.type;
        }

        return null;
    }

    private dispatchTypeCompletions(builder: CompletionBuilder, type: LuaType): void {
        // For boolean type
        if (type.kind === LuaTypeKind.Boolean) {
            builder.addItem({ label: "true", kind: 14, detail: "boolean" });
            builder.addItem({ label: "false", kind: 14, detail: "boolean" });
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
        }

        // For nil checks
        if (type.kind === LuaTypeKind.Nil) {
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
        }

        // For string type, offer nil
        if (type.kind === LuaTypeKind.String) {
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
            builder.addItem({ label: '""', kind: 21, detail: "empty string", insertText: '""' });
        }

        // For number type
        if (type.kind === LuaTypeKind.Number) {
            builder.addItem({ label: "0", kind: 12, detail: "number" });
            builder.addItem({ label: "nil", kind: 14, detail: "nil" });
        }

        // For Ref types that might be enums
        if (type.kind === LuaTypeKind.Ref) {
            const refType = type as LuaRefType;
            const definitionLoader = getDefinitionLoader();
            const typeFields = definitionLoader.getTypeFields(refType.name);
            if (typeFields) {
                for (const [name] of Object.entries(typeFields)) {
                    builder.addItem({
                        label: `${refType.name}.${name}`,
                        kind: 20, // EnumMember
                        detail: refType.name,
                    });
                }
            }
        }
    }
}
