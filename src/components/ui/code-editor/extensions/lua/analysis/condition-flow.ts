// =============================================================================
// CONDITION FLOW ANALYSIS
// =============================================================================
// Port of EmmyLua's condition_flow/ module for control flow type narrowing
// See: emmylua_code_analysis/src/semantic/infer/narrow/condition_flow/

import type { LuaNode, LuaIdentifier, LuaBinaryExpression, LuaCallExpression, LuaUnaryExpression } from "../core/luaparse-types";
import type { LuaType } from "./type-system";
import { LuaTypeKind, LuaTypes, removeFalseOrNil, narrowFalseOrNil, unionType } from "./type-system";
import type { FlowTree, FlowId, FlowNode } from "./flow-graph";
import { FlowNodeKind, getSingleAntecedent, getMultiAntecedents } from "./flow-graph";

// =============================================================================
// RESULT TYPE OR CONTINUE
// =============================================================================

/**
 * Port of EmmyLua's ResultTypeOrContinue
 * Either we got a narrowed type (Result) or we should continue traversing (Continue)
 */
export type ResultTypeOrContinue =
    | { kind: 'result'; type: LuaType }
    | { kind: 'continue' };

const RESULT = (type: LuaType): ResultTypeOrContinue => ({ kind: 'result', type });
const CONTINUE: ResultTypeOrContinue = { kind: 'continue' };

// =============================================================================
// INFER CONDITION FLOW
// =============================================================================

/**
 * Port of EmmyLua's InferConditionFlow
 */
export enum InferConditionFlow {
    TrueCondition = 'true',
    FalseCondition = 'false',
}

export function getNegatedConditionFlow(flow: InferConditionFlow): InferConditionFlow {
    return flow === InferConditionFlow.TrueCondition
        ? InferConditionFlow.FalseCondition
        : InferConditionFlow.TrueCondition;
}

// =============================================================================
// TYPE NARROWING CONTEXT
// =============================================================================

/**
 * Context for type narrowing during flow analysis
 */
export interface NarrowingContext {
    /** Flow tree for the document */
    flowTree: FlowTree;
    /** Types map (offset -> type) */
    types: Map<number, LuaType>;
    /** Symbol lookup function */
    lookupSymbol: (name: string, offset?: number) => { type: LuaType } | undefined;
}

// =============================================================================
// GET TYPE AT FLOW
// =============================================================================

/**
 * Port of EmmyLua's get_type_at_flow
 * Main entry point for getting a variable's narrowed type at a specific flow position
 */
export function getTypeAtFlow(
    ctx: NarrowingContext,
    varName: string,
    baseType: LuaType,
    flowId: FlowId,
    visited: Set<FlowId> = new Set()
): LuaType {
    // Prevent infinite loops
    if (visited.has(flowId)) {
        return baseType;
    }
    visited.add(flowId);

    const flowNode = ctx.flowTree.getFlowNode(flowId);
    if (!flowNode) {
        return baseType;
    }

    let currentType = baseType;
    let antecedentFlowId = flowId;

    // Main traversal loop - port of EmmyLua's loop in get_type_at_flow
    while (true) {
        const node = ctx.flowTree.getFlowNode(antecedentFlowId);
        if (!node) {
            break;
        }

        switch (node.kind) {
            case FlowNodeKind.Start:
                // Reached the start - return base type
                return currentType;

            case FlowNodeKind.Unreachable:
                // Unreachable code - return never
                return LuaTypes.Never;

            case FlowNodeKind.Return:
            case FlowNodeKind.Break:
            case FlowNodeKind.LoopLabel: {
                // Continue to antecedent
                const ant = getSingleAntecedent(ctx.flowTree, node);
                if (ant === undefined) return currentType;
                antecedentFlowId = ant;
                continue;
            }

            case FlowNodeKind.BranchLabel: {
                // Merge multiple branches - union their types
                const antecedents = getMultiAntecedents(ctx.flowTree, node);
                if (antecedents.length === 0) return currentType;

                let mergedType: LuaType = LuaTypes.Never;
                for (const antId of antecedents) {
                    const branchType = getTypeAtFlow(ctx, varName, baseType, antId, new Set(visited));
                    mergedType = unionType(mergedType, branchType);
                }
                return mergedType;
            }

            case FlowNodeKind.TrueCondition: {
                // In truthy branch of a condition
                const condNode = node.data as { kind: 'condition'; node: LuaNode } | undefined;
                if (condNode?.kind === 'condition') {
                    const result = getTypeAtConditionFlow(
                        ctx,
                        varName,
                        currentType,
                        node,
                        condNode.node,
                        InferConditionFlow.TrueCondition
                    );
                    if (result.kind === 'result') {
                        currentType = result.type;
                    }
                }
                const ant = getSingleAntecedent(ctx.flowTree, node);
                if (ant === undefined) return currentType;
                antecedentFlowId = ant;
                continue;
            }

            case FlowNodeKind.FalseCondition: {
                // In falsy branch of a condition
                const condNode = node.data as { kind: 'condition'; node: LuaNode } | undefined;
                if (condNode?.kind === 'condition') {
                    const result = getTypeAtConditionFlow(
                        ctx,
                        varName,
                        currentType,
                        node,
                        condNode.node,
                        InferConditionFlow.FalseCondition
                    );
                    if (result.kind === 'result') {
                        currentType = result.type;
                    }
                }
                const ant = getSingleAntecedent(ctx.flowTree, node);
                if (ant === undefined) return currentType;
                antecedentFlowId = ant;
                continue;
            }

            case FlowNodeKind.Assignment: {
                // Check if this assignment affects our variable
                const assignData = node.data as { kind: 'assignment'; names: string[] } | undefined;
                if (assignData?.kind === 'assignment' && assignData.names.includes(varName)) {
                    // Variable was reassigned - stop narrowing here
                    return currentType;
                }
                const ant = getSingleAntecedent(ctx.flowTree, node);
                if (ant === undefined) return currentType;
                antecedentFlowId = ant;
                continue;
            }

            default: {
                // For other node types, continue to antecedent
                const ant = getSingleAntecedent(ctx.flowTree, node);
                if (ant === undefined) return currentType;
                antecedentFlowId = ant;
                continue;
            }
        }
    }

    return currentType;
}

// =============================================================================
// GET TYPE AT CONDITION FLOW
// =============================================================================

/**
 * Port of EmmyLua's get_type_at_condition_flow
 * Dispatches to specific handlers based on condition expression type
 */
function getTypeAtConditionFlow(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    condition: LuaNode,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    switch (condition.type) {
        case 'Identifier':
            return getTypeAtNameExpr(ctx, varName, currentType, flowNode, condition as LuaIdentifier, conditionFlow);

        case 'UnaryExpression':
            return getTypeAtUnaryFlow(ctx, varName, currentType, flowNode, condition as LuaUnaryExpression, conditionFlow);

        case 'BinaryExpression':
            return getTypeAtBinaryExpr(ctx, varName, currentType, flowNode, condition as LuaBinaryExpression, conditionFlow);

        case 'CallExpression':
            return getTypeAtCallExpr(ctx, varName, currentType, flowNode, condition as LuaCallExpression, conditionFlow);

        case 'MemberExpression':
        case 'IndexExpression':
            return getTypeAtIndexExpr(ctx, varName, currentType, flowNode, condition, conditionFlow);

        case 'ParenthesizedExpression': {
            const parenExpr = condition as { expression?: LuaNode };
            if (parenExpr.expression) {
                return getTypeAtConditionFlow(ctx, varName, currentType, flowNode, parenExpr.expression, conditionFlow);
            }
            return CONTINUE;
        }

        default:
            // TableExpression, LiteralExpression, etc. - no narrowing possible
            return CONTINUE;
    }
}

// =============================================================================
// NAME EXPRESSION NARROWING
// =============================================================================

/**
 * Port of EmmyLua's get_type_at_name_expr
 * Handles: if x then ... -> x is truthy
 */
function getTypeAtNameExpr(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    nameExpr: LuaIdentifier,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    // Check if this identifier matches our target variable
    if (nameExpr.name !== varName) {
        return CONTINUE;
    }

    // Apply narrowing based on condition flow
    const resultType = conditionFlow === InferConditionFlow.TrueCondition
        ? removeFalseOrNil(currentType)  // truthy: remove nil/false
        : narrowFalseOrNil(currentType);  // falsy: narrow to nil/false only

    return RESULT(resultType);
}

// =============================================================================
// UNARY EXPRESSION NARROWING
// =============================================================================

/**
 * Port of EmmyLua's get_type_at_unary_flow
 * Handles: if not x then ... -> inverts the condition flow
 */
function getTypeAtUnaryFlow(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    unaryExpr: LuaUnaryExpression,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    const { operator, argument } = unaryExpr;

    // Only handle 'not' operator
    if (operator !== 'not') {
        return CONTINUE;
    }

    if (!argument) {
        return CONTINUE;
    }

    // Invert the condition flow and recurse
    return getTypeAtConditionFlow(
        ctx,
        varName,
        currentType,
        flowNode,
        argument,
        getNegatedConditionFlow(conditionFlow)
    );
}

// =============================================================================
// BINARY EXPRESSION NARROWING
// =============================================================================

/**
 * Port of EmmyLua's get_type_at_binary_expr
 * Handles: ==, ~=, and, or operators
 */
function getTypeAtBinaryExpr(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    binaryExpr: LuaBinaryExpression,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    const { operator, left, right } = binaryExpr;

    if (!left || !right) {
        return CONTINUE;
    }

    switch (operator) {
        case '==':
            return tryGetAtEqOrNeqExpr(ctx, varName, currentType, flowNode, left, right, conditionFlow);

        case '~=':
            // ~= is the same as == with negated condition flow
            return tryGetAtEqOrNeqExpr(ctx, varName, currentType, flowNode, left, right, getNegatedConditionFlow(conditionFlow));

        case 'and':
            return getTypeAtAndExpr(ctx, varName, currentType, flowNode, left, right, conditionFlow);

        case 'or':
            return getTypeAtOrExpr(ctx, varName, currentType, flowNode, left, right, conditionFlow);

        default:
            return CONTINUE;
    }
}

/**
 * Port of EmmyLua's try_get_at_eq_or_neq_expr
 * Handles: x == nil, x == "value", type(x) == "string"
 */
function tryGetAtEqOrNeqExpr(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    leftExpr: LuaNode,
    rightExpr: LuaNode,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    // 1. Try type guard: type(x) == "string"
    let result = maybeTypeGuardBinary(ctx, varName, currentType, flowNode, leftExpr, rightExpr, conditionFlow);
    if (result.kind === 'result') {
        return result;
    }

    // 2. Try variable equality: x == nil
    result = maybeVarEqNarrow(ctx, varName, currentType, flowNode, leftExpr, rightExpr, conditionFlow);
    if (result.kind === 'result') {
        return result;
    }

    return CONTINUE;
}

/**
 * Port of EmmyLua's maybe_type_guard_binary
 * Handles: type(x) == "string"
 */
function maybeTypeGuardBinary(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    leftExpr: LuaNode,
    rightExpr: LuaNode,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    let typeGuardCall: LuaCallExpression | null = null;
    let literalString: string | null = null;

    // Check if left is type() call and right is string literal
    if (leftExpr.type === 'CallExpression') {
        const callExpr = leftExpr as LuaCallExpression;
        if (isTypeCall(callExpr)) {
            typeGuardCall = callExpr;
            literalString = getStringLiteralValue(rightExpr);
        }
    }

    // Check if right is type() call and left is string literal
    if (!typeGuardCall && rightExpr.type === 'CallExpression') {
        const callExpr = rightExpr as LuaCallExpression;
        if (isTypeCall(callExpr)) {
            typeGuardCall = callExpr;
            literalString = getStringLiteralValue(leftExpr);
        }
    }

    if (!typeGuardCall || !literalString) {
        return CONTINUE;
    }

    // Get the argument to type()
    const typeArg = getFirstCallArg(typeGuardCall);
    if (!typeArg) {
        return CONTINUE;
    }

    // Check if the argument is our target variable
    if (typeArg.type !== 'Identifier' || (typeArg as LuaIdentifier).name !== varName) {
        return CONTINUE;
    }

    // Map literal string to type
    const narrowType = typeStringToLuaType(literalString);
    if (!narrowType) {
        return CONTINUE;
    }

    // Apply narrowing based on condition flow
    if (conditionFlow === InferConditionFlow.TrueCondition) {
        // type(x) == "string" is true -> x is string
        return RESULT(narrowDownType(currentType, narrowType));
    } else {
        // type(x) == "string" is false -> x is NOT string
        return RESULT(removeType(currentType, narrowType));
    }
}

/**
 * Port of EmmyLua's maybe_var_eq_narrow
 * Handles: x == nil, x == value
 */
function maybeVarEqNarrow(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    leftExpr: LuaNode,
    rightExpr: LuaNode,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    // Check if left is our target variable
    if (leftExpr.type === 'Identifier' && (leftExpr as LuaIdentifier).name === varName) {
        const rightType = inferLiteralType(rightExpr);
        if (!rightType) {
            return CONTINUE;
        }

        if (conditionFlow === InferConditionFlow.TrueCondition) {
            // x == nil is true -> x is nil
            return RESULT(narrowDownType(currentType, rightType));
        } else {
            // x == nil is false -> x is NOT nil
            return RESULT(removeType(currentType, rightType));
        }
    }

    // Check if right is our target variable
    if (rightExpr.type === 'Identifier' && (rightExpr as LuaIdentifier).name === varName) {
        const leftType = inferLiteralType(leftExpr);
        if (!leftType) {
            return CONTINUE;
        }

        if (conditionFlow === InferConditionFlow.TrueCondition) {
            return RESULT(narrowDownType(currentType, leftType));
        } else {
            return RESULT(removeType(currentType, leftType));
        }
    }

    return CONTINUE;
}

/**
 * Handle AND expression: if x and y then ...
 * Both sides must be truthy
 */
function getTypeAtAndExpr(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    leftExpr: LuaNode,
    rightExpr: LuaNode,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    if (conditionFlow === InferConditionFlow.TrueCondition) {
        // Both sides are truthy - apply narrowing from both
        let narrowedType = currentType;

        const leftResult = getTypeAtConditionFlow(ctx, varName, narrowedType, flowNode, leftExpr, InferConditionFlow.TrueCondition);
        if (leftResult.kind === 'result') {
            narrowedType = leftResult.type;
        }

        const rightResult = getTypeAtConditionFlow(ctx, varName, narrowedType, flowNode, rightExpr, InferConditionFlow.TrueCondition);
        if (rightResult.kind === 'result') {
            narrowedType = rightResult.type;
        }

        if (narrowedType !== currentType) {
            return RESULT(narrowedType);
        }
    } else {
        // Either side is falsy - we can't narrow precisely, but we can try each side
        // For now, just try the left side
        return getTypeAtConditionFlow(ctx, varName, currentType, flowNode, leftExpr, InferConditionFlow.FalseCondition);
    }

    return CONTINUE;
}

/**
 * Handle OR expression: if x or y then ...
 */
function getTypeAtOrExpr(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    leftExpr: LuaNode,
    rightExpr: LuaNode,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    if (conditionFlow === InferConditionFlow.FalseCondition) {
        // Both sides are falsy - apply narrowing from both
        let narrowedType = currentType;

        const leftResult = getTypeAtConditionFlow(ctx, varName, narrowedType, flowNode, leftExpr, InferConditionFlow.FalseCondition);
        if (leftResult.kind === 'result') {
            narrowedType = leftResult.type;
        }

        const rightResult = getTypeAtConditionFlow(ctx, varName, narrowedType, flowNode, rightExpr, InferConditionFlow.FalseCondition);
        if (rightResult.kind === 'result') {
            narrowedType = rightResult.type;
        }

        if (narrowedType !== currentType) {
            return RESULT(narrowedType);
        }
    }

    return CONTINUE;
}

// =============================================================================
// CALL EXPRESSION NARROWING
// =============================================================================

/**
 * Handle call expressions in conditions
 * Currently handles: assert(x), error()
 */
function getTypeAtCallExpr(
    ctx: NarrowingContext,
    varName: string,
    currentType: LuaType,
    flowNode: FlowNode,
    callExpr: LuaCallExpression,
    conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    // Check if this is an assert() call
    const base = callExpr.base;
    if (base?.type === 'Identifier' && (base as LuaIdentifier).name === 'assert') {
        // Get the first argument
        const firstArg = getFirstCallArg(callExpr);
        if (!firstArg) {
            return CONTINUE;
        }

        // If the argument is our target variable
        if (firstArg.type === 'Identifier' && (firstArg as LuaIdentifier).name === varName) {
            // assert(x) means x must be truthy
            // In the true condition flow (after assert succeeds), remove nil/false
            if (conditionFlow === InferConditionFlow.TrueCondition) {
                return RESULT(removeFalseOrNil(currentType));
            }
            // In the false condition flow (assert would fail), x could be nil/false
            // But typically code doesn't execute after a failed assert, so this is less important
        }

        // Handle assert(type(x) == "string") pattern
        if (firstArg.type === 'BinaryExpression') {
            const binaryExpr = firstArg as LuaBinaryExpression;
            if (binaryExpr.operator === '==') {
                const result = maybeTypeGuardBinary(
                    ctx,
                    varName,
                    currentType,
                    flowNode,
                    binaryExpr.left ?? ({} as LuaNode),
                    binaryExpr.right ?? ({} as LuaNode),
                    conditionFlow
                );
                if (result.kind === 'result') {
                    return result;
                }
            }
        }
    }

    return CONTINUE;
}

/**
 * Handle index/member expressions in conditions
 */
function getTypeAtIndexExpr(
    _ctx: NarrowingContext,
    _varName: string,
    _currentType: LuaType,
    _flowNode: FlowNode,
    _indexExpr: LuaNode,
    _conditionFlow: InferConditionFlow
): ResultTypeOrContinue {
    // TODO: Handle t.field or t["field"] narrowing
    return CONTINUE;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a call expression is a type() call
 */
function isTypeCall(callExpr: LuaCallExpression): boolean {
    const base = callExpr.base;
    if (base?.type === 'Identifier' && (base as LuaIdentifier).name === 'type') {
        return true;
    }
    return false;
}

/**
 * Get string literal value from a node
 */
function getStringLiteralValue(node: LuaNode): string | null {
    if (node.type === 'StringLiteral') {
        const lit = node as { value?: string; raw?: string };
        return lit.value ?? lit.raw?.slice(1, -1) ?? null;
    }
    return null;
}

/**
 * Get the first argument of a call expression
 */
function getFirstCallArg(callExpr: LuaCallExpression): LuaNode | null {
    const args = callExpr.arguments;
    if (Array.isArray(args) && args.length > 0) {
        return args[0];
    }
    return null;
}

/**
 * Map type string to LuaType
 */
function typeStringToLuaType(typeStr: string): LuaType | null {
    switch (typeStr) {
        case 'nil': return LuaTypes.Nil;
        case 'boolean': return LuaTypes.Boolean;
        case 'number': return LuaTypes.Number;
        case 'string': return LuaTypes.String;
        case 'table': return LuaTypes.Table;
        case 'function': return LuaTypes.Function;
        case 'thread': return LuaTypes.Thread;
        case 'userdata': return LuaTypes.Userdata;
        default: return null;
    }
}

/**
 * Infer type from a literal expression
 */
function inferLiteralType(node: LuaNode): LuaType | null {
    switch (node.type) {
        case 'NilLiteral':
            return LuaTypes.Nil;
        case 'BooleanLiteral':
            return LuaTypes.Boolean;
        case 'NumericLiteral':
            return LuaTypes.Number;
        case 'StringLiteral':
            return LuaTypes.String;
        default:
            return null;
    }
}

/**
 * Port of EmmyLua's narrow_down_type
 * Narrows source type to match target type
 */
export function narrowDownType(source: LuaType, target: LuaType): LuaType {
    // If same type, return source
    if (source.kind === target.kind) {
        return source;
    }

    // If source is a union, filter to types that match target
    if (source.kind === LuaTypeKind.Union) {
        const union = source as { types: LuaType[] };
        const filtered = union.types.filter(t => {
            // Check if type matches target kind
            if (t.kind === target.kind) return true;
            // Handle literal matching base type
            if (target.kind === LuaTypeKind.String && t.kind === LuaTypeKind.StringLiteral) return true;
            if (target.kind === LuaTypeKind.Number && (t.kind === LuaTypeKind.NumberLiteral || t.kind === LuaTypeKind.Integer)) return true;
            if (target.kind === LuaTypeKind.Boolean && t.kind === LuaTypeKind.BooleanLiteral) return true;
            return false;
        });

        if (filtered.length === 0) return target;
        if (filtered.length === 1) return filtered[0];
        return { kind: LuaTypeKind.Union, types: filtered } as LuaType;
    }

    // If source could be narrowed to target, return target
    if (source.kind === LuaTypeKind.Unknown || source.kind === LuaTypeKind.Any) {
        return target;
    }

    // Otherwise return target as the narrowed type
    return target;
}

/**
 * Remove a type from a union type
 */
export function removeType(source: LuaType, toRemove: LuaType): LuaType {
    if (source.kind === LuaTypeKind.Union) {
        const union = source as { types: LuaType[] };
        const filtered = union.types.filter(t => t.kind !== toRemove.kind);

        if (filtered.length === 0) return LuaTypes.Never;
        if (filtered.length === 1) return filtered[0];
        return { kind: LuaTypeKind.Union, types: filtered } as LuaType;
    }

    // If source matches toRemove, return Never
    if (source.kind === toRemove.kind) {
        return LuaTypes.Never;
    }

    return source;
}
