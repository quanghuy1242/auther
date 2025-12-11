# Full EmmyLua Semantic Port - Task Checklist

## Phase 1: Type System Alignment
- [/] Add type kind helpers (`isTableLike`, `isFunctionLike`, `isStringLike`, etc.)
- [ ] Add [findMemberType()](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/handlers/completion.ts#1136-1156) utility function
- [ ] Add `getAllMembers()` utility function
- [ ] Review LuaType enum for parity with EmmyLua

## Phase 2: SemanticInfo API
- [ ] Create `semantic-info.ts` module
- [ ] Implement [SemanticInfo](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/handlers/hover.ts#55-65) interface
- [ ] Implement `getSemanticInfo(node)` function
- [ ] Implement `infer_token_semantic_info` equivalent
- [ ] Implement `infer_expr_semantic_decl` equivalent

## Phase 3: Member Resolution System  
- [ ] Create `member-resolution.ts` module
- [ ] Implement `MemberInfo` interface
- [ ] Implement `findMembers(type)` - find all members
- [ ] Implement `findMemberByKey(type, key)` - find specific member
- [ ] Implement `getMemberMap(type)` - for completion
- [ ] Handle Object/Table/Array/Tuple member lookup

## Phase 4: Enhanced Type Inference
- [ ] Improve index expression inference (`t[key]`)
- [ ] Improve call expression inference (return types)
- [ ] Add overload resolution basics
- [ ] Enhance type narrowing patterns

## Phase 5: Handler Integration
- [ ] Update [hover.ts](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions/hover.ts) to use SemanticInfo API
- [ ] Update [completion.ts](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/handlers/completion.ts) to use member resolution
- [ ] Update [signature-help.ts](file:///home/quanghuy1242/pjs/auther/src/components/admin/pipelines/editor-modal/lua-extensions-2/handlers/signature-help.ts) if needed
- [ ] Remove duplicate/ad-hoc type resolution code

## Verification
- [ ] TypeScript compilation passes
- [ ] Test hover on nested tables
- [ ] Test completion on local tables
- [ ] Test member expression chains
