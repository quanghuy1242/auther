import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { CompletionTriggerStatus } from "../types";
import { LuaTypeKind, LuaTypes, functionType, parseTypeString, type LuaFunctionParam, type LuaFunctionType, type LuaType } from "../../../analysis/type-system";
import { findNodePathAtOffset, isCallExpression, isIdentifier, isMemberExpression, type LuaCallExpression, type LuaExpression, type LuaIdentifier, type LuaMemberExpression } from "../../../core/luaparse-types";
import { getDefinitionLoader, type FunctionDefinition, type TableDefinition } from "../../../definitions/definition-loader";
import { formatType } from "../../../analysis/type-system";

// -----------------------------------------------------------------------------
// FUNCTION ARGUMENT PROVIDER (type-aware call argument completions)
// -----------------------------------------------------------------------------

/**
 * Provides type-aware completions for function call arguments
 * Following EmmyLua's function_provider.rs
 * When inside foo(|), infers expected param type and offers appropriate completions
 */
export class FunctionArgProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.InCallArguments) return;

        const callContext = this.getCallContext(builder);
        if (!callContext) return;

        const { callExpr, argIndex } = callContext;

        // Infer the function being called
        const funcType = this.inferFunctionType(builder, callExpr);
        if (!funcType || funcType.kind !== LuaTypeKind.FunctionType) return;

        const fnType = funcType as LuaFunctionType;
        const param = fnType.params[argIndex];
        if (!param) return;

        // Dispatch based on expected type
        this.dispatchTypeCompletions(builder, param.type, param.name);
    }

    private getCallContext(builder: CompletionBuilder): { callExpr: LuaCallExpression; argIndex: number } | null {
        const ast = builder.document.getAST();
        if (!ast) return null;

        const nodePath = findNodePathAtOffset(ast, builder.offset);

        // Find CallExpression in the path
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];
            if (isCallExpression(node)) {
                const callExpr = node as LuaCallExpression;
                const argIndex = this.getArgumentIndex(callExpr, builder.offset);
                if (argIndex >= 0) {
                    return { callExpr, argIndex };
                }
            }
        }

        return null;
    }

    private getArgumentIndex(callExpr: LuaCallExpression, offset: number): number {
        const args = callExpr.arguments;
        if (args.length === 0) return 0;

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (arg.range) {
                const [start, end] = arg.range;
                if (offset >= start && offset <= end) {
                    return i;
                }
                // If offset is before this arg, it's after the previous
                if (offset < start) {
                    return i;
                }
            }
        }

        // After all args
        return args.length;
    }

    private inferFunctionType(builder: CompletionBuilder, callExpr: LuaCallExpression): LuaType | null {
        const base = callExpr.base;
        if (!base) return null;

        // Check types map
        if (base.range) {
            const cached = builder.analysisResult.types.get(base.range[0]);
            if (cached) return cached;
        }

        // Try to resolve member expression (e.g., helpers.fetch)
        if (isMemberExpression(base)) {
            const definitionLoader = getDefinitionLoader();
            const memberExpr = base as LuaMemberExpression;

            // Build the chain
            const chain = this.buildMemberChain(memberExpr);
            if (chain.length >= 2) {
                const rootName = chain[0];
                const methodName = chain[chain.length - 1];

                // Check sandbox items
                const sandboxItem = definitionLoader.getSandboxItem(rootName);
                if (sandboxItem && (sandboxItem as TableDefinition).fields) {
                    const fields = (sandboxItem as TableDefinition).fields!;
                    const methodDef = fields[methodName];
                    if (methodDef && methodDef.kind === 'function') {
                        return this.functionDefToType(methodDef as FunctionDefinition);
                    }
                }

                // Check library
                const libDef = definitionLoader.getLibrary(rootName);
                if (libDef?.fields) {
                    const methodDef = libDef.fields[methodName];
                    if (methodDef && methodDef.kind === 'function') {
                        return this.functionDefToType(methodDef as FunctionDefinition);
                    }
                }
            }
        }

        // Try identifier (global function)
        if (isIdentifier(base)) {
            const definitionLoader = getDefinitionLoader();
            const funcName = (base as LuaIdentifier).name;
            const globalDef = definitionLoader.getGlobal(funcName);
            if (globalDef && globalDef.kind === 'function') {
                return this.functionDefToType(globalDef as FunctionDefinition);
            }

            // Check local symbol
            const symbol = builder.analysisResult.symbolTable.lookupSymbol(funcName, builder.offset);
            if (symbol) return symbol.type;
        }

        return null;
    }

    private buildMemberChain(expr: LuaMemberExpression): string[] {
        const parts: string[] = [];
        let current: LuaExpression = expr;

        while (isMemberExpression(current)) {
            const member = current as LuaMemberExpression;
            if (isIdentifier(member.identifier)) {
                parts.unshift(member.identifier.name);
            }
            current = member.base;
        }

        if (isIdentifier(current)) {
            parts.unshift((current as LuaIdentifier).name);
        }

        return parts;
    }

    private functionDefToType(def: FunctionDefinition): LuaType {
        const params: LuaFunctionParam[] = (def.params ?? []).map((p) => ({
            name: p.name,
            type: parseTypeString(p.type),
            optional: p.optional,
            vararg: p.vararg,
        }));
        const returns = def.returns
            ? [parseTypeString(def.returns.type)]
            : [LuaTypes.Void];
        return functionType(params, returns, { isAsync: def.async });
    }

    private dispatchTypeCompletions(builder: CompletionBuilder, type: LuaType, _paramName?: string): void {
        // For function types, offer lambda snippet
        if (type.kind === LuaTypeKind.FunctionType) {
            const fnType = type as LuaFunctionType;
            const paramsStr = fnType.params.map(p => p.name).join(", ");
            const label = `function(${paramsStr}) end`;
            const insertText = `function(${paramsStr})\n\t$0\nend`;

            builder.addItem({
                label,
                kind: 3, // Function
                detail: `→ ${formatType(fnType)}`,
                insertText,
                insertTextFormat: 2, // Snippet
                sortText: "0000", // Prioritize
            });
        }

        // For string Ref types that might be enums, offer string literals
        // (Simplified from original)

        // For table types, offer empty table
        if (type.kind === LuaTypeKind.Table || type.kind === LuaTypeKind.TableType) {
            builder.addItem({
                label: "{}",
                kind: 12, // Value
                detail: "Empty table",
                insertText: "{ $0 }",
                insertTextFormat: 2,
            });
        }
    }
}
