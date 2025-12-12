// =============================================================================
// SIGNATURE HELP HANDLER
// =============================================================================
// Provides function signature help for the Lua editor
// Inspired by EmmyLua's handlers/signature_helper module structure
// See: emmylua_ls/src/handlers/signature_helper/

import type { Position, SignatureHelp, SignatureInformation, ParameterInformation } from "../protocol";
import { MarkupKind } from "../protocol";
import type { LuaDocument } from "../core/document";
import type { AnalysisResult } from "../analysis/analyzer";
import type { LuaFunctionType } from "../analysis/type-system";
import { LuaTypeKind, formatType } from "../analysis/type-system";
import {
    findNodePathAtOffset,
    isCallExpression,
    isStringCallExpression,
    isTableCallExpression,
    isMemberExpression,
    isIdentifier,
} from "../core/luaparse-types";
import type {
    LuaCallExpression,
    LuaStringCallExpression,
    LuaTableCallExpression,
    LuaMemberExpression,
    LuaIdentifier,
    LuaExpression,
    LuaNode,
} from "../core/luaparse-types";
import { getDefinitionLoader } from "../definitions/definition-loader";
import type { FunctionDefinition, ParamDefinition } from "../definitions/definition-loader";

// =============================================================================
// SIGNATURE HELP BUILDER
// =============================================================================

/**
 * Builder for constructing signature help
 * Following EmmyLua's SignatureHelperBuilder pattern
 */
export class SignatureHelpBuilder {
    private signatures: SignatureInformation[] = [];
    private activeSignature = 0;
    private activeParameter = 0;

    constructor(
        readonly document: LuaDocument,
        readonly analysisResult: AnalysisResult
    ) { }

    /**
     * Add a signature from a FunctionDefinition
     */
    addSignatureFromDefinition(def: FunctionDefinition, functionName: string): void {
        const params: ParameterInformation[] = [];

        if (def.params) {
            for (const param of def.params) {
                params.push(this.buildParameterInfo(param));
            }
        }

        const signature: SignatureInformation = {
            label: def.signature ?? this.buildLabel(functionName, def.params ?? []),
            documentation: def.description
                ? { kind: MarkupKind.Markdown, value: def.description }
                : undefined,
            parameters: params,
            activeParameter: this.activeParameter,
        };

        this.signatures.push(signature);
    }

    /**
     * Add a signature from a LuaFunctionType
     */
    addSignatureFromFunctionType(fnType: LuaFunctionType, functionName: string): void {
        const params: ParameterInformation[] = [];

        for (const param of fnType.params) {
            params.push({
                label: param.name,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: `\`${param.name}\`: ${formatType(param.type)}`,
                },
            });
        }

        const signature: SignatureInformation = {
            label: this.buildLabelFromType(functionName, fnType),
            parameters: params,
            activeParameter: this.activeParameter,
        };

        this.signatures.push(signature);
    }

    /**
     * Set the active parameter index
     */
    setActiveParameter(index: number): void {
        this.activeParameter = index;
        // Update existing signatures
        for (const sig of this.signatures) {
            sig.activeParameter = index;
        }
    }

    /**
     * Set the active signature index
     */
    setActiveSignature(index: number): void {
        this.activeSignature = index;
    }

    /**
     * Build the SignatureHelp result
     */
    build(): SignatureHelp | null {
        if (this.signatures.length === 0) {
            return null;
        }

        return {
            signatures: this.signatures,
            activeSignature: this.activeSignature,
            activeParameter: this.activeParameter,
        };
    }

    private buildParameterInfo(param: ParamDefinition): ParameterInformation {
        let label = param.name;
        if (param.optional) {
            label += "?";
        }

        const docParts: string[] = [];
        docParts.push(`\`${param.name}\`: ${param.type}`);
        if (param.description) {
            docParts.push(param.description);
        }

        return {
            label,
            documentation: {
                kind: MarkupKind.Markdown,
                value: docParts.join("\n\n"),
            },
        };
    }

    private buildLabel(name: string, params: ParamDefinition[]): string {
        const paramStrs = params.map((p) => {
            let s = p.name;
            if (p.optional) s += "?";
            return s;
        });
        return `${name}(${paramStrs.join(", ")})`;
    }

    private buildLabelFromType(name: string, fnType: LuaFunctionType): string {
        const paramStrs = fnType.params.map((p) => {
            let s = p.name;
            if (p.optional) s += "?";
            s += ": " + formatType(p.type);
            return s;
        });
        const returns = fnType.returns.length > 0
            ? fnType.returns.map((t) => formatType(t)).join(", ")
            : "void";
        return `function ${name}(${paramStrs.join(", ")}): ${returns}`;
    }
}

// =============================================================================
// CALL EXPRESSION CONTEXT
// =============================================================================

/**
 * Context information for a call expression
 */
interface CallContext {
    /** The call expression node */
    callNode: LuaCallExpression | LuaStringCallExpression | LuaTableCallExpression;
    /** Function name (e.g., "helpers.fetch", "print") */
    functionName: string;
    /** Base name (e.g., "helpers" for "helpers.fetch") */
    baseName?: string;
    /** Member name (e.g., "fetch" for "helpers.fetch") */
    memberName?: string;
    /** Active parameter index */
    activeParameter: number;
    /** Whether this is a method call (using :) */
    isMethodCall: boolean;
}

/**
 * Find the call context at a position
 * Following EmmyLua's approach to finding CallExpr
 */
import * as luaparse from "luaparse";

/**
 * Find the call context at a position
 * Based on reference implementation's "Repair Strategy"
 */
function findCallContext(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    offset: number
): CallContext | null {
    const ast = document.getAST();
    const path = ast ? findNodePathAtOffset(ast, offset) : [];

    // Helper to check if path leads to a call
    const findCallInPath = (p: LuaNode[]): LuaCallExpression | LuaStringCallExpression | LuaTableCallExpression | null => {
        for (let i = p.length - 1; i >= 0; i--) {
            const node = p[i];
            if (isCallExpression(node)) return node as LuaCallExpression;
            if (isStringCallExpression(node)) return node as LuaStringCallExpression;
            if (isTableCallExpression(node)) return node as LuaTableCallExpression;
        }
        return null;
    };

    let callNode = findCallInPath(path);

    // If no call found, try speculative repairs
    if (!callNode) {
        const text = document.getText();
        const repairs = [
            "0",         // Argument placeholder (func(a, |) -> func(a, 0))
            ")",         // Closing paren
            "0)",        // Arg + Close
            "''",        // String
            "{}",        // Table
            " end",      // Block close
        ];

        for (const repair of repairs) {
            try {
                // inject repair at cursor
                let candidate = "";
                if (repair === " end") {
                    candidate = text + repair;
                } else {
                    candidate = text.slice(0, offset) + repair + text.slice(offset);
                }

                // Parse candidate code
                const repairedAst = luaparse.parse(candidate, {
                    wait: false,
                    locations: true,
                    ranges: true,
                    luaVersion: "5.3"
                }) as unknown as LuaNode;

                // Check if this repair yielded a valid call node at the original offset
                const repairedPath = findNodePathAtOffset(repairedAst, offset);
                const candidateCall = findCallInPath(repairedPath);

                if (candidateCall) {
                    callNode = candidateCall;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
    }

    if (!callNode) return null;

    // Check if we're inside the arguments (not editing the function name)
    if (isCallExpression(callNode)) {
        const call = callNode as LuaCallExpression;
        const base = call.base;
        if (base.range && offset <= base.range[1]) {
            // Still editing the function name
            return null;
        }
    }

    // Extract function info
    const { functionName, baseName, memberName, isMethodCall } = extractFunctionInfo(callNode);

    // Calculate active parameter
    const activeParameter = calculateActiveParameter(document, callNode, offset);

    return {
        callNode,
        functionName,
        baseName,
        memberName,
        activeParameter,
        isMethodCall,
    };
}





/**
 * Extract function name and info from a call expression
 */
function extractFunctionInfo(
    callNode: LuaCallExpression | LuaStringCallExpression | LuaTableCallExpression
): { functionName: string; baseName?: string; memberName?: string; isMethodCall: boolean } {
    let base: LuaExpression;
    if (isCallExpression(callNode)) {
        base = (callNode as LuaCallExpression).base;
    } else if (isStringCallExpression(callNode)) {
        base = (callNode as LuaStringCallExpression).base;
    } else {
        base = (callNode as LuaTableCallExpression).base;
    }

    // Handle member expression: helpers.fetch or helpers:fetch
    if (isMemberExpression(base)) {
        const memberExpr = base as LuaMemberExpression;
        const memberName = memberExpr.identifier.name;
        const isMethodCall = memberExpr.indexer === ":";

        let baseName = "";
        if (isIdentifier(memberExpr.base)) {
            baseName = (memberExpr.base as LuaIdentifier).name;
        }

        return {
            functionName: baseName ? `${baseName}.${memberName}` : memberName,
            baseName: baseName || undefined,
            memberName,
            isMethodCall,
        };
    }

    // Handle simple identifier: print, tostring
    if (isIdentifier(base)) {
        return {
            functionName: (base as LuaIdentifier).name,
            isMethodCall: false,
        };
    }

    return {
        functionName: "function",
        isMethodCall: false,
    };
}

/**
 * Calculate the active parameter index based on cursor position
 * Following EmmyLua's get_current_param_index logic
 */
function calculateActiveParameter(
    document: LuaDocument,
    callNode: LuaCallExpression | LuaStringCallExpression | LuaTableCallExpression,
    offset: number
): number {
    // For string and table calls, there's only one parameter
    if (isStringCallExpression(callNode) || isTableCallExpression(callNode)) {
        return 0;
    }

    const call = callNode as LuaCallExpression;
    const args = call.arguments;

    if (!args || args.length === 0) {
        return 0;
    }

    // Find which argument we're in
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.range) continue;

        // If cursor is inside this argument
        if (offset >= arg.range[0] && offset <= arg.range[1]) {
            return i;
        }

        // If cursor is before this argument's start
        if (offset < arg.range[0]) {
            return i;
        }
    }

    // Cursor is after all arguments
    // Check if there's a trailing comma
    const lastArg = args[args.length - 1];
    if (lastArg.range && call.range) {
        const text = document.getText();
        const textBetween = text.slice(lastArg.range[1], offset);
        if (textBetween.includes(",")) {
            return args.length;
        }
    }

    return args.length - 1;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Options for signature help
 */
export interface SignatureHelpOptions {
    /** Current hook name for context-aware help */
    hookName?: string;
    /** Whether this is a retrigger */
    isRetrigger?: boolean;
    /** The trigger character (if any) */
    triggerCharacter?: string;
}

/**
 * Main signature help handler following EmmyLua's on_signature_helper_handler pattern
 */
export function getSignatureHelp(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    position: Position,
    _options: SignatureHelpOptions = {}
): SignatureHelp | null {
    const offset = document.positionToOffset(position);

    // Find call context
    const context = findCallContext(document, analysisResult, offset);
    if (!context) return null;

    const builder = new SignatureHelpBuilder(document, analysisResult);
    builder.setActiveParameter(context.activeParameter);

    const definitionLoader = getDefinitionLoader();

    // Try to find definition-based signature
    if (context.baseName && context.memberName) {
        // Handle sandbox item member calls (data-driven)
        const memberDef = definitionLoader.getMemberDefinition(context.baseName, context.memberName);
        if (memberDef?.kind === 'function') {
            builder.addSignatureFromDefinition(memberDef as FunctionDefinition, context.functionName);
            return builder.build();
        }

        // Handle library.* calls (e.g., string.sub, math.floor)
        const libMethod = definitionLoader.getLibraryMethod(context.baseName, context.memberName);
        if (libMethod && libMethod.kind === "function") {
            builder.addSignatureFromDefinition(libMethod as FunctionDefinition, context.functionName);
            return builder.build();
        }
    } else if (context.functionName) {
        // Handle global functions (print, tostring, etc.)
        const globalDef = definitionLoader.getGlobal(context.functionName);
        if (globalDef && globalDef.kind === "function") {
            builder.addSignatureFromDefinition(
                {
                    kind: "function",
                    signature: globalDef.signature ?? `${context.functionName}()`,
                    description: globalDef.description ?? "",
                    params: globalDef.params,
                    returns: globalDef.returns,
                },
                context.functionName
            );
            return builder.build();
        }

        // Handle sandbox item functions (data-driven)
        const sandboxItem = definitionLoader.getSandboxItem(context.functionName);
        if (sandboxItem?.kind === 'function') {
            builder.addSignatureFromDefinition(sandboxItem as FunctionDefinition, context.functionName);
            return builder.build();
        }
    }

    // Try inferred function type from analysis
    if (context.callNode.range) {
        // Look up the base expression's type
        const call = context.callNode as LuaCallExpression;
        if (call.base && call.base.range) {
            const baseType = analysisResult.types.get(call.base.range[0]);
            if (baseType && baseType.kind === LuaTypeKind.FunctionType) {
                builder.addSignatureFromFunctionType(
                    baseType as LuaFunctionType,
                    context.functionName
                );
                return builder.build();
            }
        }
    }

    return null;
}

/**
 * Get the range of the current call for tracking
 */
export function getCallRange(
    document: LuaDocument,
    analysisResult: AnalysisResult,
    position: Position
): { from: number; to: number } | null {
    const offset = document.positionToOffset(position);
    const context = findCallContext(document, analysisResult, offset);
    if (!context || !context.callNode.range) return null;

    return {
        from: context.callNode.range[0],
        to: context.callNode.range[1],
    };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { findCallContext, calculateActiveParameter, extractFunctionInfo };
