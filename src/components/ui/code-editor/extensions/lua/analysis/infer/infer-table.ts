// =============================================================================
// TABLE EXPRESSION TYPE INFERENCE
// =============================================================================
// Type inference for table constructors
// Port of EmmyLua's table literal inference

import type { LuaType } from '../type-system';
import { tableType, arrayType, unionType } from '../type-system';
import type {
    LuaTableConstructorExpression,
    LuaTableKey,
    LuaIdentifier,
    LuaExpression
} from '../../core/luaparse-types';

/**
 * Infer the type of a table constructor expression
 * Port of EmmyLua's table literal inference
 */
export function inferTableType(
    expr: LuaTableConstructorExpression,
    analyzeExpr: (e: LuaExpression) => LuaType
): LuaType {
    const fields = new Map<string, { name: string; type: LuaType; optional?: boolean }>();
    let isArray = true;
    let arrayIndex = 1;

    for (const field of expr.fields) {
        switch (field.type) {
            case 'TableKeyString': {
                isArray = false;
                const keyName = (field.key as LuaIdentifier).name;
                const valueType = analyzeExpr(field.value as LuaExpression);
                fields.set(keyName, { name: keyName, type: valueType });
                break;
            }

            case 'TableKey': {
                isArray = false;
                // Dynamic key - track usage
                analyzeExpr((field as LuaTableKey).key);
                analyzeExpr((field as LuaTableKey).value);
                break;
            }

            case 'TableValue': {
                const valueType = analyzeExpr(field.value as LuaExpression);
                fields.set(String(arrayIndex), { name: String(arrayIndex), type: valueType });
                arrayIndex++;
                break;
            }
        }
    }

    if (isArray && fields.size > 0) {
        // Infer array element type
        const types = Array.from(fields.values()).map((f) => f.type);
        const elementType = types.length === 1 ? types[0] : unionType(...types);
        return arrayType(elementType);
    }

    return tableType(Array.from(fields.values()));
}
