# Comprehensive Semantic Analyzer Port Plan

## EmmyLua Semantic Module Structure

```
semantic/
├── cache/          # Type inference caching
├── decl/           # Declaration indexing
├── generic/        # Generic type instantiation
├── guard.rs        # Recursion guards (prevent infinite loops)
├── infer/          # Type inference engine
│   ├── infer_binary/    # Binary expression inference
│   ├── infer_call/      # Function call inference
│   ├── infer_doc_type   # Doc comment type parsing
│   ├── infer_index      # Index expression inference (44KB!)
│   ├── infer_name       # Name/identifier inference
│   ├── infer_table      # Table constructor inference
│   ├── infer_unary      # Unary expression inference
│   └── narrow/          # Type narrowing (if x then...)
├── member/         # Member resolution
│   ├── find_members     # Find all members of a type
│   ├── find_index       # Index access resolution
│   ├── get_member_map   # Member map for completion
│   └── infer_raw_member # Raw member type inference
├── overload_resolve/    # Function overload resolution
├── reference/           # Reference tracking
├── semantic_info/       # Unified semantic info (type + decl)
├── type_check/          # Type compatibility checking
└── visibility/          # Visibility (public/private/protected)
```

---

## Gap Analysis

| EmmyLua Module | Current Status | Gap Level |
|----------------|----------------|-----------|
| **infer/** | ✅ Partial - [analyzer.ts](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/analysis/analyzer.ts) has basic inference | 🟡 Medium |
| **member/** | ❌ Missing - Ad-hoc in handlers | 🔴 High |
| **semantic_info/** | ❌ Missing - No unified SemanticInfo | 🔴 High |
| **type_check/** | ✅ Partial - [isAssignableTo()](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/analysis/type-system.ts#473-546) exists | 🟡 Medium |
| **narrow/** | ✅ Partial - FlowTree exists | 🟡 Medium |
| **generic/** | ❌ Missing - No generic instantiation | 🟠 Low priority |
| **overload_resolve/** | ❌ Missing - Single function assumed | 🟠 Low priority |
| **visibility/** | ❌ Missing - No visibility checks | 🟠 Low priority |
| **reference/** | ❌ Missing - No reference tracking | 🟠 Low priority |
| **cache/** | ❌ Missing - Re-infers on every request | 🟠 Performance |
| **guard/** | ✅ Partial - Some recursion limits | 🟢 OK |

---

## Specific Missing Features

### 🔴 Critical (Causes bugs like the one we just fixed)

1. **Unified SemanticInfo API**
   - EmmyLua: `get_semantic_info(node) -> { type, declaration }`
   - Current: Scattered logic in each handler
   - **Fix**: Create `getSemanticInfo()` in analyzer

2. **Centralized Member Resolution**
   - EmmyLua: `find_members(type)` returns all members
   - Current: Each handler does its own lookup
   - **Fix**: Create `findMembers()` utility

3. **Type Kind Consistency**
   - EmmyLua: `is_table()` checks multiple variants (Table, Object, Array, Tuple)
   - Current: Manual `=== TableType` checks miss cases
   - **Fix**: Add `isTableLike()`, `isFunctionLike()` helpers

### 🟡 Medium (Affects correctness in edge cases)

4. **Index Expression Inference**
   - EmmyLua: 44KB file handling `t[key]`, bracket access
   - Current: Basic handling, missing many cases
   - **Impact**: `t["key"]` may not work like `t.key`

5. **Call Expression Inference**
   - EmmyLua: Full overload resolution, self handling
   - Current: Returns first matching signature
   - **Impact**: Wrong type for overloaded functions

6. **Type Narrowing Completeness**
   - EmmyLua: Handles [type(x)](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/analysis/type-system.ts#389-459), `x ~= nil`, patterns
   - Current: Basic `if x then` narrowing
   - **Impact**: Less precise types in conditionals

### 🟠 Low Priority (Nice to have)

7. Generics instantiation
8. Visibility checks (public/private)
9. Reference tracking (find usages)
10. Type inference caching

---

## Recommended Implementation Phases

### Phase 1: Quick Fixes (1-2 hours) ✨ Recommended Now

Add helper functions without restructuring:

```typescript
// type-system.ts
export function isTableLike(type: LuaType): boolean {
    return type.kind === LuaTypeKind.Table || 
           type.kind === LuaTypeKind.TableType ||
           type.kind === LuaTypeKind.Array ||
           type.kind === LuaTypeKind.Tuple;
}

export function findMemberType(type: LuaType, name: string): LuaType | null;
export function getAllMembers(type: LuaType): Map<string, LuaType>;
```

### Phase 2: SemanticInfo API (4-6 hours)

Create unified semantic info:

```typescript
// semantic-info.ts (new file)
export interface SemanticInfo {
    type: LuaType;
    declaration?: Symbol | GlobalDefinition;
    isTableField?: boolean;
}

export function getSemanticInfo(
    analysisResult: AnalysisResult,
    node: LuaNode
): SemanticInfo | null;
```

### Phase 3: Member Resolution System (6-8 hours)

Port EmmyLua's member resolution:

```typescript
// member-resolution.ts (new file)
export interface MemberInfo {
    name: string;
    type: LuaType;
    source: 'field' | 'method' | 'index';
    declaration?: Symbol;
}

export function findMembers(type: LuaType): MemberInfo[];
export function findMemberByKey(type: LuaType, key: string): MemberInfo | null;
```

### Phase 4: Enhanced Type Inference (8-12 hours)

Improve specific inference areas:
- Index expressions (`t[key]`)
- Call expression return types
- Type narrowing patterns

---

## Decision: What To Do Now?

| Option | Effort | Fixes Current Issue | Future-Proof |
|--------|--------|---------------------|--------------|
| **A. Phase 1 only** | 1-2h | ✅ Yes | 🟡 Partial |
| **B. Phases 1+2** | 5-8h | ✅ Yes | ✅ Yes |
| **C. Full port (1-4)** | 20-30h | ✅ Yes | ✅ Yes |

**My recommendation**: Start with **Phase 1** now (quick wins), then **Phase 2** as follow-up work.
