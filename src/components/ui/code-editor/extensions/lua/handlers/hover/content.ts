import { MarkupKind, type Hover, type Range } from "../../protocol";
import type { Symbol } from "../../analysis/symbol-table";
import { SymbolKind } from "../../analysis/symbol-table";
import { LuaTypeKind, formatType, type LuaFunctionType, type LuaType, type LuaTableType } from "../../analysis/type-system";
import type { LuaNode } from "../../core/luaparse-types";
import type { FieldDefinition, FunctionDefinition, PropertyDefinition, GlobalDefinition } from "../../definitions/definition-loader";
import { HoverBuilder } from "./builder";

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format a function signature for display
 */
export function formatFunctionSignature(name: string, fnType: LuaFunctionType): string {
    const params = fnType.params
        .map((p) => {
            let paramStr = p.name;
            if (p.optional) paramStr += "?";
            paramStr += ": " + formatType(p.type);
            return paramStr;
        })
        .join(", ");

    const returns = fnType.returns.length > 0
        ? fnType.returns.map((t) => formatType(t)).join(", ")
        : "void";

    return `function ${name}(${params}): ${returns}`;
}

/**
 * Phase E Item 7: Unwrap multi-return types to first return value
 * When hovering over `local x = func()` where func returns (string, integer),
 * we should show just `string` for x
 */
export function unwrapMultiReturn(type: LuaType): LuaType {
    // Check if this is a tuple/multi-return type
    // In Lua, multi-return is often represented as a tuple or array of types
    if (type.kind === LuaTypeKind.Table) {
        const tableType = type as unknown as LuaTableType;
        // Check if it looks like a tuple (has numeric indices)
        // using proper check if fields is a Map or object depending on implementation
        // Assuming fields is Map based on usage in original code (tableType.fields.has('1'))
        if (tableType.fields && "has" in tableType.fields && (tableType.fields as Map<string, unknown>).has('1')) {
            const fields = tableType.fields as Map<string, { name: string, type: LuaType }>;
            // Return just the first element
            const firstField = fields.get('1');
            if (firstField) {
                return firstField.type;
            }
        }
    }

    // If it's a union of return types, might need special handling
    // For now, return as-is
    return type;
}

/**
 * Check if a string is a Lua keyword
 */
export function isKeyword(str: string): boolean {
    const keywords = new Set([
        "and", "break", "do", "else", "elseif", "end", "false", "for",
        "function", "goto", "if", "in", "local", "nil", "not", "or",
        "repeat", "return", "then", "true", "until", "while",
    ]);
    return keywords.has(str);
}

// =============================================================================
// HOVER CONTENT BUILDERS
// =============================================================================

/**
 * Build hover content for a keyword
 */
export function buildKeywordHover(keyword: string): Hover | null {
    const keywordDocs: Record<string, string> = {
        and: "Logical AND operator. Returns the first operand if it is falsy, otherwise returns the second operand.",
        or: "Logical OR operator. Returns the first operand if it is truthy, otherwise returns the second operand.",
        not: "Logical NOT operator. Returns `true` if the operand is falsy, otherwise returns `false`.",
        if: "Conditional statement. Executes code if the condition is truthy.\n\n```lua\nif condition then\n    -- code\nelseif other_condition then\n    -- code\nelse\n    -- code\nend\n```",
        then: "Part of an `if` statement. Follows the condition.",
        else: "Part of an `if` statement. Executes if all conditions are falsy.",
        elseif: "Part of an `if` statement. Adds an additional condition to check.",
        end: "Ends a block (`function`, `if`, `for`, `while`, `repeat`, `do`).",
        for: "Loop statement. Iterates over a range or iterator.\n\n```lua\n-- Numeric for\nfor i = 1, 10 do\n    -- code\nend\n\n-- Generic for\nfor k, v in pairs(t) do\n    -- code\nend\n```",
        while: "Loop statement. Executes while the condition is truthy.\n\n```lua\nwhile condition do\n    -- code\nend\n```",
        repeat: "Loop statement. Executes until the condition is truthy.\n\n```lua\nrepeat\n    -- code\nuntil condition\n```",
        until: "Part of a `repeat` loop. Specifies the exit condition.",
        do: "Starts a block, or part of a `while`/`for` loop.",
        break: "Exits the innermost loop.",
        return: "Returns from a function with optional values.\n\n```lua\nreturn value1, value2\n```",
        function: "Declares a function.\n\n```lua\nfunction name(params)\n    -- body\nend\n\nlocal f = function(params)\n    -- body\nend\n```",
        local: "Declares a local variable or function.\n\n```lua\nlocal x = 10\nlocal function f() end\n```",
        nil: "The nil type and value. Represents the absence of a value.",
        true: "Boolean true value.",
        false: "Boolean false value.",
        in: "Part of a generic `for` loop. Separates variables from the iterator.",
        goto: "Jumps to a label.\n\n```lua\ngoto label\n::label::\n```",
    };

    const doc = keywordDocs[keyword];
    if (!doc) return null;

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: `**${keyword}** *(keyword)*\n\n${doc}`,
        },
    };
}


/**
 * Build hover content for a declaration (variable, parameter, etc.)
 * Following EmmyLua's build_decl_hover pattern
 */
export function buildDeclHover(
    builder: HoverBuilder,
    symbol: Symbol,
    type: LuaType
): void {
    const prefix = symbol.kind === SymbolKind.Local
        ? "local "
        : symbol.kind === SymbolKind.Parameter
            ? "(parameter) "
            : symbol.kind === SymbolKind.UpValue
                ? "(upvalue) "
                : symbol.kind === SymbolKind.LoopVariable
                    ? "(loop variable) "
                    : symbol.kind === SymbolKind.Global
                        ? "(global) "
                        : "";

    // Check if it's a function
    if (type.kind === LuaTypeKind.FunctionType) {
        const fnType = type as LuaFunctionType;

        // Phase E Item 8: Show overloads if available
        if (fnType.overloads && fnType.overloads.length > 0) {
            // Show all signatures as overloads
            const signatures = [fnType, ...fnType.overloads];
            const overloadText = signatures.map((sig, index) => {
                const signature = formatFunctionSignature(symbol.name, sig);
                return signatures.length > 1 ? `(${index + 1}) ${signature}` : signature;
            }).join('\n');
            builder.setTypeDescription(prefix + overloadText);
        } else {
            const signature = formatFunctionSignature(symbol.name, fnType);
            builder.setTypeDescription(prefix + signature);
        }
    } else {
        // Phase E Item 7: Unwrap multi-return types in assignment context
        const unwrappedType = unwrapMultiReturn(type);
        const typeStr = formatType(unwrappedType, { multiline: true });
        builder.setTypeDescription(`${prefix}${symbol.name}: ${typeStr}`);
    }

    if (symbol.documentation) {
        builder.setDescription(symbol.documentation);
    }
}

/**
 * Build hover content for a member (field, method)
 * Following EmmyLua's build_member_hover pattern
 */
export function buildMemberHover(
    builder: HoverBuilder,
    memberName: string,
    type: LuaType,
    definition?: FieldDefinition
): void {
    if (type.kind === LuaTypeKind.FunctionType) {
        const fnType = type as LuaFunctionType;

        // Phase E Item 8: Show overloads if available
        if (fnType.overloads && fnType.overloads.length > 0) {
            const signatures = [fnType, ...fnType.overloads];
            const overloadText = signatures.map((sig, index) => {
                const signature = formatFunctionSignature(memberName, sig);
                return signatures.length > 1 ? `(${index + 1}) ${signature}` : signature;
            }).join('\n');
            builder.setTypeDescription(`(method) ${overloadText}`);
        } else {
            const signature = formatFunctionSignature(memberName, fnType);
            builder.setTypeDescription(`(method) ${signature}`);
        }

        // Add param descriptions from definition
        if (definition && definition.kind === "function") {
            const fnDef = definition as FunctionDefinition;
            if (fnDef.params) {
                for (const param of fnDef.params) {
                    if (param.description) {
                        builder.addParamDescription(param.name, param.description);
                    }
                }
            }
            if (fnDef.returns?.description) {
                builder.setReturnDescription(fnDef.returns.description);
            }
        }
    } else {
        const typeStr = formatType(type, { multiline: true });
        builder.setTypeDescription(`(field) ${memberName}: ${typeStr}`);
    }

    if (definition?.description) {
        builder.setDescription(definition.description);
    }
}

/**
 * Build hover from a FieldDefinition
 */
export function buildDefinitionHover(name: string, def: FieldDefinition): Hover {
    const parts: string[] = [];

    // Type signature
    if (def.kind === "function") {
        const fnDef = def as FunctionDefinition;
        parts.push("```lua\n" + (fnDef.signature ?? `function ${name}()`) + "\n```");
    } else if (def.kind === "property") {
        const propDef = def as PropertyDefinition;
        parts.push("```lua\n" + `${name}: ${propDef.type}` + "\n```");
    } else if (def.kind === "table") {
        parts.push("```lua\n" + `${name}: table` + "\n```");
    }

    // Description
    if (def.description) {
        parts.push(def.description);
    }

    // Parameters
    if (def.kind === "function") {
        const fnDef = def as FunctionDefinition;
        if (fnDef.params && fnDef.params.length > 0) {
            const paramDocs = fnDef.params
                .filter((p) => p.description)
                .map((p) => `@*param* \`${p.name}\` — ${p.description}`)
                .join("\n\n");
            if (paramDocs) {
                parts.push(paramDocs);
            }
        }

        if (fnDef.returns?.description) {
            parts.push(`@*return* — ${fnDef.returns.description}`);
        }
    }

    // Example
    if (def.kind === "function") {
        const fnDef = def as FunctionDefinition;
        if (fnDef.example) {
            parts.push("**Example:**\n```lua\n" + fnDef.example + "\n```");
        }
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: parts.join("\n\n"),
        },
    };
}

/**
 * Build hover from a GlobalDefinition
 */
export function buildGlobalDefinitionHover(name: string, def: GlobalDefinition): Hover {
    const parts: string[] = [];

    // Type signature
    if (def.kind === "function") {
        parts.push("```lua\n" + (def.signature ?? `function ${name}()`) + "\n```");
    } else if (def.kind === "property") {
        parts.push("```lua\n" + `${name}: ${def.type ?? "unknown"}` + "\n```");
    } else if (def.kind === "table") {
        parts.push("```lua\n" + `${name}: table` + "\n```");
    }

    // Description
    if (def.description) {
        parts.push(def.description);
    }

    // Parameters
    if (def.kind === "function" && def.params && def.params.length > 0) {
        const paramDocs = def.params
            .filter((p) => p.description)
            .map((p) => `@*param* \`${p.name}\` — ${p.description}`)
            .join("\n\n");
        if (paramDocs) {
            parts.push(paramDocs);
        }
    }

    if (def.returns?.description) {
        parts.push(`@*return* — ${def.returns.description}`);
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: parts.join("\n\n"),
        },
    };
}

/**
 * Handle hover for literal values
 */
export function handleLiteralHover(node: LuaNode, range: Range): Hover | null {
    const nodeType = node.type;

    // We mostly don't want to hover over simple literals like strings or numbers.
    // User specifically requested to NOT show tooltip for "not" inside a string,
    // which implies strings shouldn't have hover info.

    /*
    if (nodeType === "StringLiteral") {
        const value = (node as LuaStringLiteral).value;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`"${value}"\`: string`,
            },
            range,
        };
    }

    if (nodeType === "NumericLiteral") {
        const value = (node as LuaNumericLiteral).value;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`${value}\`: number`,
            },
            range,
        };
    }

    if (nodeType === "BooleanLiteral") {
        const value = (node as LuaBooleanLiteral).value;
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: `\`${value}\`: boolean`,
            },
            range,
        };
    }
    */

    if (nodeType === "NilLiteral") {
        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: "`nil`: nil\n\nThe absence of any useful value.",
            },
            range,
        };
    }

    return null;
}
