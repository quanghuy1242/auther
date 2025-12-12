// =============================================================================
// BINARY/UNARY EXPRESSION TYPE INFERENCE
// =============================================================================
// Type inference for binary, unary, and logical expressions
// Port of EmmyLua's expression inference

import type { LuaType } from '../type-system';
import { LuaTypes, unionType } from '../type-system';
import type {
    LuaBinaryExpression,
    LuaLogicalExpression,
    LuaUnaryExpression,
    LuaExpression
} from '../../core/luaparse-types';

/**
 * Infer the type of a binary expression
 * Port of EmmyLua's infer_binary_expr
 */
export function inferBinaryExpressionType(
    expr: LuaBinaryExpression,
    analyzeExpr: (e: LuaExpression) => LuaType
): LuaType {
    // Track usage in operands
    analyzeExpr(expr.left as LuaExpression);
    analyzeExpr(expr.right as LuaExpression);

    const op = expr.operator;

    // Comparison operators always return boolean
    if (['==', '~=', '<', '>', '<=', '>='].includes(op)) {
        return LuaTypes.Boolean;
    }

    // String concatenation
    if (op === '..') {
        return LuaTypes.String;
    }

    // Arithmetic operators
    if (['+', '-', '*', '/', '//', '%', '^'].includes(op)) {
        // Integer division returns integer
        if (op === '//') {
            return LuaTypes.Integer;
        }
        return LuaTypes.Number;
    }

    // Bitwise operators
    if (['&', '|', '~', '<<', '>>'].includes(op)) {
        return LuaTypes.Integer;
    }

    return LuaTypes.Unknown;
}

/**
 * Infer the type of a unary expression
 * Port of EmmyLua's unary expression inference
 */
export function inferUnaryExpressionType(
    expr: LuaUnaryExpression,
    analyzeExpr: (e: LuaExpression) => LuaType
): LuaType {
    // Track usage in operand
    analyzeExpr(expr.argument);
    const op = expr.operator;

    if (op === 'not') {
        return LuaTypes.Boolean;
    }

    if (op === '-') {
        return LuaTypes.Number;
    }

    if (op === '#') {
        return LuaTypes.Integer;
    }

    if (op === '~') {
        return LuaTypes.Integer;
    }

    return LuaTypes.Unknown;
}

/**
 * Infer the type of a logical expression
 * Port of EmmyLua's logical expression handling
 * 
 * In Lua:
 * - `a and b` returns b if a is truthy, otherwise a
 * - `a or b` returns a if truthy, otherwise b
 */
export function inferLogicalExpressionType(
    expr: LuaLogicalExpression,
    analyzeExpr: (e: LuaExpression) => LuaType
): LuaType {
    const left = analyzeExpr(expr.left as LuaExpression);
    const right = analyzeExpr(expr.right as LuaExpression);

    if (expr.operator === 'and') {
        // Returns right if left is truthy, otherwise left
        return unionType(left, right);
    }

    if (expr.operator === 'or') {
        // Returns left if truthy, otherwise right
        return unionType(left, right);
    }

    return LuaTypes.Unknown;
}

