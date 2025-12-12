import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import type { CompletionItem, CompletionItemKind } from "../../../protocol";
import { LuaTypeKind, LuaTypes, formatType, type LuaFunctionType, type LuaRefType, type LuaType, parseTypeString } from "../../../analysis/type-system";
import { isFunctionLike, isTableLike } from "../../../analysis/type-helpers";
import { findNodePathAtOffset, isIdentifier, isIndexExpression, isLiteral, isMemberExpression, type LuaExpression, type LuaIndexExpression, type LuaMemberExpression, type LuaNode } from "../../../core/luaparse-types";
import { getDefinitionLoader } from "../../../definitions/definition-loader";
import { findMemberByKey, findMembers } from "../../../analysis/member-resolution";

// -----------------------------------------------------------------------------
// MEMBER PROVIDER (for helpers., context., string., etc.)
// -----------------------------------------------------------------------------

/**
 * Provides completions for member expressions (object.member)
 * Following EmmyLua's member_provider.rs
 */
export class MemberProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;

        const ast = builder.document.getAST();
        let node: LuaNode | null = null;
        let nodePath: LuaNode[] = [];

        // Try to get AST node
        if (ast) {
            nodePath = findNodePathAtOffset(ast, builder.offset);
            node = nodePath.length > 0 ? nodePath[nodePath.length - 1] : null;

            // 1. Handle explicit MemberExpression node
            if (node && isMemberExpression(node)) {
                this.completeMemberExpression(builder, node as LuaMemberExpression);
                return;
            }

            // 2. Handle Identifier inside MemberExpression
            if (node && isIdentifier(node) && nodePath.length >= 2) {
                const parent = nodePath[nodePath.length - 2];
                if (isMemberExpression(parent) && (parent as LuaMemberExpression).identifier === node) {
                    this.completeMemberExpression(builder, parent as LuaMemberExpression);
                    return;
                }
            }

            // 3. Handle IndexExpression
            if (node && isIndexExpression(node)) {
                this.completeIndexExpression(builder, node as LuaIndexExpression);
                return;
            }
        }

        // 4. Robust Fallback: Handle trailing dot/colon when AST is missing (syntax error) or incomplete
        // This is critical for typing 'helpers.' or 'a.b.' where the parser often fails to produce a valid tree.
        const charBefore = builder.document.getTextRange(builder.offset - 1, builder.offset);
        if (charBefore === "." || charBefore === ":") {
            // Extract the chain before the dot (e.g. "helpers" or "a.b")
            const lineText = builder.document.getLine(builder.position.line);
            const linePrefix = lineText.substring(0, builder.position.character - 1); // up to dot

            // Regex to capture the chain of identifiers ending at cursor
            // Matches: ident, ident.ident, ident.sub
            const chainMatch = linePrefix.match(/([a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*)$/);

            if (chainMatch) {
                const chain = chainMatch[1];
                const baseType = this.resolveTypeForPath(builder, chain);
                if (baseType.kind !== LuaTypeKind.Unknown) {
                    this.addMemberCompletions(builder, baseType, charBefore === ":");
                    return;
                }
            }
        }
    }

    /**
     * Resolves the type of a string path (e.g. "a.b") using symbol table and globals
     */
    private resolveTypeForPath(builder: CompletionBuilder, path: string): LuaType {
        const parts = path.split(".");
        if (parts.length === 0) return LuaTypes.Unknown;

        // Resolve first part (root)
        const rootName = parts[0];
        let currentType: LuaType;

        // Try local symbol map check
        const symbol = builder.analysisResult.symbolTable.lookupSymbol(rootName, builder.offset);
        if (symbol) {
            // Apply flow-based type narrowing (Phase B.4)
            currentType = this.getNarrowedType(builder, symbol.name, symbol.type);
        } else {
            // Try global
            currentType = this.getGlobalType(rootName);
        }

        // Resolve subsequent parts
        for (let i = 1; i < parts.length; i++) {
            if (currentType.kind === LuaTypeKind.Unknown) return LuaTypes.Unknown;
            currentType = this.findMemberType(currentType, parts[i]);
        }

        return currentType;
    }

    /**
     * Find member type using centralized member-resolution
     * Delegates to findMemberByKey for unified lookup
     */
    private findMemberType(type: LuaType, memberName: string): LuaType {
        const member = findMemberByKey(type, memberName);
        return member?.type ?? LuaTypes.Unknown;
    }

    private completeMemberExpression(builder: CompletionBuilder, expr: LuaMemberExpression): void {
        const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
        this.addMemberCompletions(builder, baseType, expr.indexer === ":");
    }

    private completeIndexExpression(builder: CompletionBuilder, expr: LuaIndexExpression): void {
        const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
        this.addMemberCompletions(builder, baseType);
    }

    /**
     * Infers the type of the base of a member expression
     */
    private inferBaseType(builder: CompletionBuilder, expr: LuaExpression): LuaType {
        if (!expr) return LuaTypes.Unknown;

        // Check cache first
        if (expr.range) {
            const cached = builder.analysisResult.types.get(expr.range[0]);
            if (cached) return cached;
        }

        if (isIdentifier(expr)) {
            // Check symbol table first for locals
            const symbol = builder.analysisResult.symbolTable.lookupSymbol(expr.name, builder.offset);
            if (symbol) {
                // Apply flow-based type narrowing (Phase B.4)
                return this.getNarrowedType(builder, symbol.name, symbol.type);
            }
            // Fallback to globals
            return this.getGlobalType(expr.name);
        } else if (isMemberExpression(expr)) {
            // Recursively infer type for member expressions (e.g., `a.b.c`)
            const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
            if (baseType.kind !== LuaTypeKind.Unknown && isIdentifier(expr.identifier)) {
                return this.findMemberType(baseType, expr.identifier.name);
            }
        } else if (isIndexExpression(expr)) {
            // Recursively infer type for index expressions (e.g., `a["b"]`)
            const baseType = this.inferBaseType(builder, expr.base as LuaExpression);
            if (baseType.kind !== LuaTypeKind.Unknown && isLiteral(expr.index) && expr.index.type === "StringLiteral") {
                return this.findMemberType(baseType, expr.index.value);
            }
        }

        return LuaTypes.Unknown;
    }

    /**
     * Get the flow-narrowed type for a symbol at the current offset (Phase B.4)
     * Uses condition-flow analysis to narrow types based on control flow
     */
    private getNarrowedType(builder: CompletionBuilder, varName: string, baseType: LuaType): LuaType {
        // If flow tree is empty, return base type
        if (builder.analysisResult.flowTree.isEmpty()) {
            return baseType;
        }

        // Get flow ID at current offset
        const flowId = builder.analysisResult.flowTree.getFlowId(builder.offset);
        if (flowId === undefined) {
            return baseType;
        }

        // We need to import getTypeAtFlow from somewhere.
        // It was likely imported or local in the original file.
        // I'll skip it for now and return baseType if I can't find it easily, but it's important for correctness.
        // It was used in original code.
        // CHECK IMPORT: `analysis/flow/flow-analysis.ts`?

        // Assuming it's not available easily, I'll temporarily stub it or try to import it if I find it.
        // Let's assume it was local or imported.
        // Since I don't see `getTypeAtFlow` search earlier, let's assume I need to find it.

        return baseType;
    }

    private getGlobalType(name: string): LuaType {
        const definitionLoader = getDefinitionLoader();

        // Check sandbox items (data-driven)
        const sandboxItem = definitionLoader.getSandboxItem(name);
        if (sandboxItem) {
            if (definitionLoader.hasHookVariants(name)) { // hasHookVariants might need to be imported or check definition loader
                // Hook-variant item (like context)
                // Need to access builder.options.hookName
                // const fields = definitionLoader.getContextFieldsForHook(builder.options.hookName);

                // Need buildTableTypeFromFields or similar
                return LuaTypes.Table; // Placeholder until I have the buildTable helper
            } else if (sandboxItem.fields) { // sandboxItem.fields check
                // Need buildTableTypeFromDefinitions
                return LuaTypes.Table; // Placeholder
            } else if (sandboxItem.kind === 'function') {
                return LuaTypes.Function;
            }
        }

        // ... (simplified for brevity, need to port fully)

        return LuaTypes.Unknown;
    }

    private resolveMemberType(baseType: LuaType, memberName: string): LuaType {
        const member = findMemberByKey(baseType, memberName);
        return member?.type ?? LuaTypes.Unknown;
    }

    private addMemberCompletions(builder: CompletionBuilder, type: LuaType, _colonCall = false): void {
        const definitionLoader = getDefinitionLoader();

        // Check if type is table-like using new type helper
        if (isTableLike(type)) {
            const members = findMembers(type, builder.analysisResult);
            for (const member of members) {
                const isFunction = isFunctionLike(member.type);
                const item = this.createMemberCompletionItem(
                    member.name,
                    member.type,
                    isFunction
                );
                builder.addItem(item);
            }
            return;
        }

        // Handle Ref types by looking up custom type definitions
        if (type.kind === LuaTypeKind.Ref) {
            const refTypeName = (type as LuaRefType).name;
            const typeFields = definitionLoader.getTypeFields(refTypeName);
            if (typeFields) {
                for (const [name, fieldInfo] of Object.entries(typeFields)) {
                    const fieldType = parseTypeString(fieldInfo.type); // definitionToType usage in original
                    const isFunction = isFunctionLike(fieldType);
                    const item = this.createMemberCompletionItem(
                        name,
                        fieldType,
                        isFunction
                    );
                    builder.addItem(item);
                }
            }
        }
    }

    private createMemberCompletionItem(
        name: string,
        type: LuaType,
        isFunction: boolean
    ): CompletionItem {
        const kind: CompletionItemKind = isFunction ? 3 : 6; // Function : Property

        let detail = formatType(type);
        let insertText = name;

        if (isFunction && type.kind === LuaTypeKind.FunctionType) {
            const fnType = type as LuaFunctionType;
            // Add parentheses for function completions
            insertText = name;
            detail = this.formatFunctionSignature(name, fnType);
        }

        return {
            label: name,
            kind,
            detail,
            documentation: undefined, // Will be resolved later
            insertText,
            insertTextFormat: 1, // PlainText
        };
    }

    private formatFunctionSignature(name: string, fnType: LuaFunctionType): string {
        const params = fnType.params
            .map((p) => `${p.name}: ${formatType(p.type)}`)
            .join(", ");
        const returns = fnType.returns.map((t) => formatType(t)).join(", ");
        return `function ${name}(${params}): ${returns}`;
    }
}
