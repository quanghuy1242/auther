// =============================================================================
// MEMBER RESOLUTION
// =============================================================================
// Port of EmmyLua's semantic/member module
// Provides centralized member lookup for types
// See: emmylua-analyzer-rust/crates/emmylua_code_analysis/src/semantic/member/

import type { LuaType, LuaTableType, LuaArrayType, LuaTupleType, LuaUnionType } from './type-system';
import { LuaTypeKind, LuaTypes, formatType } from './type-system';
import type { AnalysisResult } from './analyzer';
import { getDefinitionLoader, type FieldDefinition } from '../definitions/definition-loader';

// =============================================================================
// MEMBER INFO TYPE
// =============================================================================

/**
 * Information about a member of a type
 * Port of LuaMemberInfo from EmmyLua
 */
export interface MemberInfo {
    /** The member name */
    name: string;
    /** The member's type */
    type: LuaType;
    /** Where this member comes from */
    source: MemberSource;
    /** Whether the member is optional */
    optional?: boolean;
    /** Description/documentation */
    description?: string;
    /** Whether this is a method (callable) */
    isMethod?: boolean;
}

/**
 * Source of a member definition
 */
export type MemberSource =
    | { kind: 'tableField' }
    | { kind: 'arrayIndex'; elementType: LuaType }
    | { kind: 'tupleIndex'; index: number }
    | { kind: 'method' }
    | { kind: 'sandbox'; definition: FieldDefinition }
    | { kind: 'library'; definition: FieldDefinition };

// =============================================================================
// FIND MEMBERS API
// =============================================================================

/**
 * Find all members of a type
 * Port of find_members from EmmyLua's semantic/member/find_members.rs
 */
export function findMembers(
    type: LuaType,
    _analysisResult?: AnalysisResult
): MemberInfo[] {
    const members: MemberInfo[] = [];

    collectMembers(type, members, new Set());

    return members;
}

/**
 * Find a specific member by key
 * Port of find_members_with_key from EmmyLua
 */
export function findMemberByKey(
    type: LuaType,
    key: string,
    _analysisResult?: AnalysisResult
): MemberInfo | null {
    // TableType - direct field lookup
    if (type.kind === LuaTypeKind.TableType) {
        const tableType = type as LuaTableType;
        const field = tableType.fields?.get(key);
        if (field) {
            return {
                name: key,
                type: field.type,
                source: { kind: 'tableField' },
                optional: field.optional,
                description: field.description,
                isMethod: field.type.kind === LuaTypeKind.FunctionType,
            };
        }
    }

    // Array - numeric index lookup
    if (type.kind === LuaTypeKind.Array) {
        const arrayType = type as LuaArrayType;
        if (/^\d+$/.test(key)) {
            return {
                name: key,
                type: arrayType.elementType,
                source: { kind: 'arrayIndex', elementType: arrayType.elementType },
            };
        }
    }

    // Tuple - positional lookup
    if (type.kind === LuaTypeKind.Tuple) {
        const tupleType = type as LuaTupleType;
        const index = parseInt(key, 10);
        if (!isNaN(index) && index >= 1 && index <= tupleType.elements.length) {
            return {
                name: key,
                type: tupleType.elements[index - 1],
                source: { kind: 'tupleIndex', index: index - 1 },
            };
        }
    }

    // Union - try each member
    if (type.kind === LuaTypeKind.Union) {
        const union = type as LuaUnionType;
        for (const member of union.types) {
            const result = findMemberByKey(member, key);
            if (result) return result;
        }
    }

    // Ref type - lookup in definition loader
    if (type.kind === LuaTypeKind.Ref) {
        const refType = type as { name: string };
        const definitionLoader = getDefinitionLoader();
        const typeFields = definitionLoader.getTypeFields(refType.name);
        if (typeFields && key in typeFields) {
            const fieldDef = typeFields[key] as unknown as FieldDefinition;
            return {
                name: key,
                type: LuaTypes.Unknown, // Would need definitionToType here
                source: { kind: 'sandbox', definition: fieldDef },
                description: fieldDef.description,
            };
        }
    }

    return null;
}

/**
 * Get all members as a map (for completion)
 * Port of get_member_map from EmmyLua
 */
export function getMemberMap(
    type: LuaType,
    _analysisResult?: AnalysisResult
): Map<string, MemberInfo> {
    const members = findMembers(type, _analysisResult);
    const map = new Map<string, MemberInfo>();

    for (const member of members) {
        // Only keep first occurrence (no duplicates)
        if (!map.has(member.name)) {
            map.set(member.name, member);
        }
    }

    return map;
}

// =============================================================================
// SANDBOX/GLOBAL MEMBER LOOKUP
// =============================================================================

/**
 * Find members of a sandbox item (helpers, context, etc.)
 */
export function findSandboxMembers(name: string, hookName?: string): MemberInfo[] {
    const definitionLoader = getDefinitionLoader();
    const members: MemberInfo[] = [];

    // Get sandbox item
    const item = definitionLoader.getSandboxItem(name);
    if (!item) return members;

    // Get base fields
    if (item.fields) {
        for (const [fieldName, fieldDef] of Object.entries(item.fields)) {
            members.push({
                name: fieldName,
                type: LuaTypes.Unknown, // Would need conversion
                source: { kind: 'sandbox', definition: fieldDef },
                description: (fieldDef as FieldDefinition).description,
                isMethod: (fieldDef as FieldDefinition).kind === 'function',
            });
        }
    }

    // Get hook-specific fields if applicable
    if (hookName && definitionLoader.hasHookVariants(name)) {
        const hookFields = definitionLoader.getContextFieldsForHook(hookName);
        if (hookFields) {
            for (const [fieldName, fieldDef] of Object.entries(hookFields)) {
                members.push({
                    name: fieldName,
                    type: LuaTypes.Unknown,
                    source: { kind: 'sandbox', definition: fieldDef },
                    description: (fieldDef as { description?: string }).description,
                });
            }
        }
    }

    return members;
}

/**
 * Find members of a library (string, table, math, etc.)
 */
export function findLibraryMembers(name: string): MemberInfo[] {
    const definitionLoader = getDefinitionLoader();
    const members: MemberInfo[] = [];

    const lib = definitionLoader.getLibrary(name);
    if (!lib) return members;

    for (const [fieldName, fieldDef] of Object.entries(lib.fields)) {
        members.push({
            name: fieldName,
            type: LuaTypes.Unknown,
            source: { kind: 'library', definition: fieldDef },
            description: (fieldDef as FieldDefinition).description,
            isMethod: (fieldDef as FieldDefinition).kind === 'function',
        });
    }

    return members;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Recursively collect members from a type
 */
function collectMembers(
    type: LuaType,
    members: MemberInfo[],
    visited: Set<LuaType>
): void {
    // Prevent infinite recursion
    if (visited.has(type)) return;
    visited.add(type);

    // TableType - collect from fields map
    if (type.kind === LuaTypeKind.TableType) {
        const tableType = type as LuaTableType;
        if (tableType.fields && tableType.fields.size > 0) {
            for (const [name, field] of tableType.fields.entries()) {
                members.push({
                    name,
                    type: field.type,
                    source: { kind: 'tableField' },
                    optional: field.optional,
                    description: field.description,
                    isMethod: field.type.kind === LuaTypeKind.FunctionType,
                });
            }
        }
    }

    // Tuple - collect indexed elements
    if (type.kind === LuaTypeKind.Tuple) {
        const tupleType = type as LuaTupleType;
        tupleType.elements.forEach((elemType, idx) => {
            members.push({
                name: String(idx + 1), // Lua 1-indexed
                type: elemType,
                source: { kind: 'tupleIndex', index: idx },
            });
        });
    }

    // Union - collect from all members
    if (type.kind === LuaTypeKind.Union) {
        const union = type as LuaUnionType;
        for (const member of union.types) {
            collectMembers(member, members, visited);
        }
    }

    // Ref - lookup type definition
    if (type.kind === LuaTypeKind.Ref) {
        const refType = type as { name: string };
        const definitionLoader = getDefinitionLoader();
        const typeFields = definitionLoader.getTypeFields(refType.name);
        if (typeFields) {
            for (const [name, fieldDef] of Object.entries(typeFields)) {
                const def = fieldDef as unknown as FieldDefinition;
                members.push({
                    name,
                    type: LuaTypes.Unknown,
                    source: { kind: 'sandbox', definition: def },
                    description: def.description,
                });
            }
        }
    }
}

/**
 * Get completion items from members
 */
export function membersToCompletions(members: MemberInfo[]): Array<{
    label: string;
    kind: 'field' | 'method' | 'property';
    detail?: string;
    documentation?: string;
}> {
    return members.map(member => ({
        label: member.name,
        kind: member.isMethod ? 'method' : 'field',
        detail: formatType(member.type),
        documentation: member.description,
    }));
}
