# Lua LSP Architecture Refactoring

## Objective
Refactor lua-extensions from hardcoded approach to LSP-inspired architecture with proper type system, symbol table, and decoupled handlers.

---

## Planning Phase

- [x] Explore existing `lua-extensions` code structure
- [x] Review `pipeline-engine.ts` for sandbox builtins
- [x] Research EmmyLua analyzer architecture
- [x] Create comprehensive implementation plan
- [ ] **User review and approval of plan**

---

## Phase 1: Core Infrastructure
- [ ] Create `protocol.ts` with LSP-standard types
- [ ] Create `core/document.ts` for document abstraction
- [ ] Create `core/luaparse-types.ts` for Luaparse type declarations
- [ ] Create `definitions/lua-builtins.json` for Lua stdlib
- [ ] Create `definitions/sandbox-definitions.json` for sandbox builtins
- [ ] Create `definitions/definition-loader.ts`

## Phase 2: Analysis Engine
- [ ] Create `analysis/type-system.ts`
- [ ] Create `analysis/symbol-table.ts`
- [ ] Create `analysis/diagnostics.ts`
- [ ] Create `analysis/analyzer.ts`

## Phase 3: LSP Handlers
- [ ] Create `handlers/completion.ts`
- [ ] Create `handlers/hover.ts`
- [ ] Create `handlers/diagnostics.ts`
- [ ] Create `handlers/signature-help.ts`
- [ ] Create `handlers/goto-definition.ts`
- [ ] Create `handlers/find-references.ts`
- [ ] Create `handlers/semantic-tokens.ts`
- [ ] Create `handlers/inlay-hints.ts`

## Phase 4: CodeMirror Integration
- [ ] Create `codemirror/adapters.ts`
- [ ] Create `codemirror/extensions.ts`
- [ ] Create `codemirror/styles.ts`
- [ ] Create `index.ts` main exports

## Phase 5: Migration & Cleanup
- [ ] Update `ScriptEditorModal` to use new extensions
- [ ] Add unit tests
- [ ] Remove old `lua-extensions` folder
