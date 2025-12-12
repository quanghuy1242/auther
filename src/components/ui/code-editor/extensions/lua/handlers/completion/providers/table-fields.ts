import type { CompletionProvider } from "../types";
import type { CompletionBuilder } from "../builder";
import { CompletionTriggerStatus } from "../types";
import { LuaTypeKind, formatType, type LuaTableType, type LuaRefType, type LuaType, type LuaFunctionType, parseTypeString } from "../../../analysis/type-system";
import { findNodePathAtOffset, isAssignmentStatement, isIdentifier, isLiteral, isLocalStatement, isTableConstructor, type LuaAssignmentStatement, type LuaIdentifier, type LuaLocalStatement, type LuaNode, type LuaTableConstructorExpression, type LuaTableKeyString } from "../../../core/luaparse-types";
import { getDefinitionLoader } from "../../../definitions/definition-loader";

// -----------------------------------------------------------------------------
// TABLE FIELD PROVIDER (for completions inside table constructors)
// -----------------------------------------------------------------------------

/**
 * Provides completions inside table constructors { }
 * Following EmmyLua's table_field_provider.rs
 * When cursor is in { | } and table has expected type, offers field names
 */
export class TableFieldProvider implements CompletionProvider {
    addCompletions(builder: CompletionBuilder): void {
        if (builder.isStopped()) return;
        if (builder.triggerStatus !== CompletionTriggerStatus.InTableConstructor) return;

        const tableContext = this.getTableContext(builder);
        if (!tableContext) return;

        const { tableExpr, expectedType } = tableContext;
        if (!expectedType) return;

        // Get existing field names to avoid duplicates
        const existingFields = this.getExistingFieldKeys(tableExpr);

        // Add field completions from expected type
        this.addFieldCompletions(builder, expectedType, existingFields);

        builder.stopHere();
    }

    private getTableContext(builder: CompletionBuilder): { tableExpr: LuaTableConstructorExpression; expectedType: LuaType | null } | null {
        const ast = builder.document.getAST();
        if (!ast) return null;

        const nodePath = findNodePathAtOffset(ast, builder.offset);

        // Find TableConstructorExpression in path
        for (let i = nodePath.length - 1; i >= 0; i--) {
            const node = nodePath[i];
            if (isTableConstructor(node)) {
                const tableExpr = node as LuaTableConstructorExpression;
                const expectedType = this.inferExpectedType(builder, nodePath, i);
                return { tableExpr, expectedType };
            }
        }

        return null;
    }

    private inferExpectedType(builder: CompletionBuilder, nodePath: LuaNode[], tableIndex: number): LuaType | null {
        // Look for assignment context: local x = { } or x = { }
        for (let i = tableIndex - 1; i >= 0; i--) {
            const node = nodePath[i];

            if (isLocalStatement(node)) {
                const stmt = node as LuaLocalStatement;
                // Look for type annotation in comments (simplified version)
                // For now, check if there's a cached type from analysis
                if (stmt.variables.length > 0 && stmt.variables[0].range) {
                    const cachedType = builder.analysisResult.types.get(stmt.variables[0].range[0]);
                    if (cachedType) return cachedType;
                }
            }

            if (isAssignmentStatement(node)) {
                const stmt = node as LuaAssignmentStatement;
                if (stmt.variables.length > 0) {
                    const target = stmt.variables[0];
                    if (target.range) {
                        const cachedType = builder.analysisResult.types.get(target.range[0]);
                        if (cachedType) return cachedType;
                    }

                    // Try to look up type from symbol table
                    if (isIdentifier(target)) {
                        const symbol = builder.analysisResult.symbolTable.lookupSymbol(
                            (target as LuaIdentifier).name,
                            builder.offset
                        );
                        if (symbol) return symbol.type;
                    }
                }
            }
        }

        return null;
    }

    private getExistingFieldKeys(tableExpr: LuaTableConstructorExpression): Set<string> {
        const keys = new Set<string>();

        for (const field of tableExpr.fields) {
            if (field.type === "TableKeyString") {
                const keyField = field as LuaTableKeyString;
                if (keyField.key && isIdentifier(keyField.key)) {
                    keys.add(keyField.key.name);
                }
            } else if (field.type === "TableKey") {
                // Handle ["key"] = value form
                if (isLiteral(field.key) && field.key.type === "StringLiteral") {
                    keys.add(field.key.value);
                }
            }
        }

        return keys;
    }

    private addFieldCompletions(builder: CompletionBuilder, type: LuaType, existingFields: Set<string>): void {
        const definitionLoader = getDefinitionLoader();

        // Handle TableType
        if (type.kind === LuaTypeKind.TableType) {
            const tableType = type as LuaTableType;
            tableType.fields.forEach((field) => {
                if (existingFields.has(field.name)) return;

                const isFunction = field.type.kind === LuaTypeKind.FunctionType;
                const { insertText, insertTextFormat } = this.getFieldInsertText(field.name, field.type, isFunction);

                builder.addItem({
                    label: `${field.name} = `,
                    kind: 5, // Field
                    detail: formatType(field.type),
                    insertText,
                    insertTextFormat,
                });
            });
        }

        // Handle Ref types
        if (type.kind === LuaTypeKind.Ref) {
            const refType = type as LuaRefType;
            const typeFields = definitionLoader.getTypeFields(refType.name);
            if (typeFields) {
                for (const [name, fieldDef] of Object.entries(typeFields)) {
                    if (existingFields.has(name)) continue;

                    const fieldType = parseTypeString(fieldDef.type);
                    const isFunction = fieldType.kind === LuaTypeKind.FunctionType;
                    const { insertText, insertTextFormat } = this.getFieldInsertText(name, fieldType, isFunction);

                    builder.addItem({
                        label: `${name} = `,
                        kind: 5, // Field
                        detail: fieldDef.type,
                        insertText,
                        insertTextFormat,
                    });
                }
            }
        }
    }

    private getFieldInsertText(name: string, type: LuaType, isFunction: boolean): { insertText: string; insertTextFormat: 1 | 2 } {
        if (isFunction && type.kind === LuaTypeKind.FunctionType) {
            const fnType = type as LuaFunctionType;
            const paramsStr = fnType.params.map(p => p.name).join(", ");
            return {
                insertText: `${name} = function(${paramsStr})\n\t$0\nend`,
                insertTextFormat: 2, // Snippet
            };
        }

        return {
            insertText: `${name} = $0`,
            insertTextFormat: 2, // Snippet
        };
    }
}
