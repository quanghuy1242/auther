// =============================================================================
// MERGE RETURN TYPES
// =============================================================================
// Utility for merging return types from multiple parallel scripts.
// Used for context.prev which contains merged data from all scripts in the
// previous layer.

import { LuaType, LuaTypes, LuaTypeKind, LuaTableType, tableType } from "./type-system";
import { extractReturnType, extractReturnDataType } from "./extract-return-type";

/**
 * Represents a merged table field with source tracking
 */
interface MergedField {
    name: string;
    type: LuaType;
    optional: boolean;
    sources: string[]; // Script IDs that contribute this field
}

/**
 * Merge return types from multiple parallel scripts.
 * Creates a union type where all fields are optional (since any script might
 * have returned early or not included certain fields).
 *
 * @param scriptCodes - Array of script source codes
 * @param scriptIds - Optional array of script IDs for source tracking
 * @returns Merged table type with all fields from all scripts
 */
export function mergeReturnTypes(
    scriptCodes: string[],
    scriptIds?: string[]
): LuaType {
    if (scriptCodes.length === 0) {
        return LuaTypes.Unknown;
    }

    // Extract return types from all scripts (unused, reserved for future use)
    const _returnTypes = scriptCodes.map((code) => extractReturnType(code));

    // Merge the top-level fields (allowed, error, data)
    const mergedFields = new Map<string, MergedField>();

    // Always include the standard ScriptOutput fields
    mergedFields.set("allowed", {
        name: "allowed",
        type: LuaTypes.Boolean,
        optional: false,
        sources: [],
    });
    mergedFields.set("error", {
        name: "error",
        type: LuaTypes.String,
        optional: true,
        sources: [],
    });

    // Merge 'data' fields from all scripts
    const dataFields = new Map<string, MergedField>();

    for (let i = 0; i < scriptCodes.length; i++) {
        const dataType = extractReturnDataType(scriptCodes[i]);
        const scriptId = scriptIds?.[i] || `script_${i}`;

        if (dataType.kind === LuaTypeKind.TableType) {
            const tbl = dataType as LuaTableType;
            if (tbl.fields) {
                for (const field of tbl.fields.values()) {
                    const existing = dataFields.get(field.name);
                    if (existing) {
                        existing.sources.push(scriptId);
                        // If types differ, widen to unknown
                        if (existing.type.kind !== field.type.kind) {
                            existing.type = LuaTypes.Any;
                        }
                    } else {
                        dataFields.set(field.name, {
                            name: field.name,
                            type: field.type,
                            optional: true, // All merged fields are optional
                            sources: [scriptId],
                        });
                    }
                }
            }
        }
    }

    // Build the merged data type
    const dataFieldsArray = Array.from(dataFields.values()).map((f) => ({
        name: f.name,
        type: f.type,
        optional: f.optional,
    }));

    if (dataFieldsArray.length > 0) {
        mergedFields.set("data", {
            name: "data",
            type: tableType(dataFieldsArray),
            optional: true,
            sources: [],
        });
    }

    // Convert to final table type
    const finalFields = Array.from(mergedFields.values()).map((f) => ({
        name: f.name,
        type: f.type,
        optional: f.optional,
    }));

    return tableType(finalFields);
}

/**
 * Merge just the 'data' fields from multiple scripts.
 * Returns a table type containing all data fields from all scripts.
 *
 * @param scriptCodes - Array of script source codes
 * @returns Table type with merged data fields
 */
export function mergeReturnDataFields(scriptCodes: string[]): LuaType {
    if (scriptCodes.length === 0) {
        return LuaTypes.Unknown;
    }

    const dataFields = new Map<string, { name: string; type: LuaType; optional: boolean }>();

    for (const code of scriptCodes) {
        const dataType = extractReturnDataType(code);

        if (dataType.kind === LuaTypeKind.TableType) {
            const tbl = dataType as LuaTableType;
            if (tbl.fields) {
                for (const field of tbl.fields.values()) {
                    if (!dataFields.has(field.name)) {
                        dataFields.set(field.name, {
                            name: field.name,
                            type: field.type,
                            optional: true, // All merged fields are optional
                        });
                    }
                }
            }
        }
    }

    if (dataFields.size === 0) {
        return LuaTypes.Unknown;
    }

    return tableType(Array.from(dataFields.values()));
}
