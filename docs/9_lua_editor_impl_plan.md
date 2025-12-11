
# Ultimate Lua Editor Upgrade Plan

This plan represents the complete roadmap for upgrading the Lua editor. It details every feature required to achieve a desktop-class IDE experience.

# Goal Description
Transform the Lua editor into a highly intelligent environment with deep understanding of code semantics, structure, and types.

## Detailed Feature Specification

### 1. Robust Type Inference Engine
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/type-inference.ts`

The core intelligence layer. It will move beyond simple regex/AST parsing to full data flow analysis.
- **Rich Type System**: precise representation of:
  - Primitives (`string`, `number`, `boolean`, `nil`).
  - Tables with known schemas (`fields: Map<string, LuaType>`).
  - Functions with signatures (`params: LuaType[]`, `returns: LuaType`).
  - Context Objects (`PipelineUser`, `PipelineSession`).
  - Unions (`string | nil`).
- **Recursive Propagation**:
  - **Variable Assignment**: `local b = a` copies `a`'s type to `b`.
  - **Member Access**: `context.user` resolves to `PipelineUser` schema. `context.user.email` resolves to `string`.
  - **Deep Nesting**: `local x = context.user; local y = x.email` -> `y` is `string`.
- **Table Construction**:
  - `local config = { port = 8080, host = "localhost" }`.
  - Infer `config` as `{ port: number, host: string }`.
- **Function Returns**:
  - **Helper API**: Hardcoded schemas for `helpers.fetch`, `helpers.hash`, etc.
  - **Built-in API**: Types for `string.lower`, `table.insert`, etc.
  - **Local Functions**: Parse LuaDoc `@return` tags (e.g., `--- @return string`) to infer return types.
- **Scope Awareness**:
  - Correctly handle `do...end`, `if...then...end`, `for` loops.
  - Track variable shadowing (inner scope variable hiding outer scope).

### 2. Context-Aware Autocomplete
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/autocomplete.ts`

- **Integration**: Connect directly to the new `type-inference` engine.
- **Smart triggers**:
  - Type `myTable.` -> Show *only* the fields known to exist on `myTable`.
  - Type `context.user.` -> Show properties of `PipelineUser`.
- **Snippets**: Enhanced function snippets that pre-fill known arguments.

### 3. Semantic Highlighting
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/semantic-highlighting.ts` (NEW)

- **Purpose**: Colorize code based on *meaning*, not just syntax.
- **Highlights**:
  - **Parameters**: Distinct color/style (e.g., italics orange) to distinguish from locals.
  - **Globals**: `context`, `helpers`, `table` get a special "global" color (e.g., purple).
  - **Upvalues**: Variables defined in an outer function scope get a distinct style.

### 4. Inlay Hints
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/inlay-hints.ts` (NEW)

- **Parameter Hints**: Show argument names in function calls.
  - Code: `helpers.fetch("url", { method = "post" })`
  - View: `helpers.fetch(url: "url", options: { ... })`
- **Type Hints**: Show inferred types for variables.
  - Code: `local response = helpers.fetch(...)`
  - View: `local response`: *`FetchResponse`* `= ...`

### 5. Rename Symbol (F2)
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/rename.ts` (NEW)

- **Functionality**: Rename a symbol across its entire valid scope.
- **Safety**:
  - Respects scoping rules (renaming a shadowed variable doesn't affect the outer one).
  - Updates all references identified by the `find-references` logic.

### 6. Auto-Highlighting
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/document-highlights.ts` (NEW)

- **Behavior**: When cursor rests on a symbol, implicitly highlight all other occurrences of that symbol in the editor.
- **UX**: Subtle background highlight, distinct from the "Find" highlight.

### 7. Code Actions (Quick Fixes)
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/code-actions.ts` (NEW)

- **Missing Return**: Detect hooks that require a return (blocking/enrichment) but lack one. Offer action: "Add default return".
- **Unused Variable**: If linter flags a variable as unused, offer action: "Remove variable".

### 8. Document Outline
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/outline.ts` (NEW)

- **Feature**: Provide a structural view of the document.
- **Structure**:
  - Top-level variables.
  - Function declarations (nested).
  - Important markers (comments like `--- MARK: Config`).

### 9. Enhanced Hover
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/hover.ts`

- **Rich Tooltips**:
  - Display the full inferred type string (e.g., `table<string, number>`).
  - For tables, pretty-print the known structure.

### 10. Advanced Linter Diagnostics
**Location**: `src/components/admin/pipelines/editor-modal/lua-extensions/linter.ts`

- **Read-Only Enforcement**: Error if user tries to assign to `context` or `helpers`.
- **Shadowing Warning**: Info/Warning if a variable name shadows an existing one.

---

## File Modification Plan

#### [MODIFY] `src/components/admin/pipelines/editor-modal/lua-extensions/type-inference.ts`
- **Structure**: Add `kind` to `VariableType`. Support nested `fields` map.
- **Logic**: Recursively resolve types. Handle `local b = a`. Handle `context.user.email`.
- **Returns**: Map helper functions to their return schemas.

#### [MODIFY] `src/components/admin/pipelines/editor-modal/lua-extensions/autocomplete.ts`
- Use `type-inference` to get the type of the variable before the dot.
- If `type === 'PipelineUser'`, suggest user fields.
- If `type === 'table'` with known fields, suggest them.

#### [NEW] `src/components/admin/pipelines/editor-modal/lua-extensions/semantic-highlighting.ts`
- Create a `ViewPlugin` that runs type inference.
- Apply decorators to tokens: `.cm-lua-parameter`, `.cm-lua-global`, `.cm-lua-upvalue`.

#### [NEW] `src/components/admin/pipelines/editor-modal/lua-extensions/inlay-hints.ts`
- Create a `ViewPlugin` providing `Decoration.widget`.
- Show `name:` before arguments in helper calls.
- Show `: type` after variable declarations.

#### [NEW] `src/components/admin/pipelines/editor-modal/lua-extensions/document-highlights.ts`
- Implement `cursorTooltip` or similar extension to highlight occurrences.

#### [NEW] `src/components/admin/pipelines/editor-modal/lua-extensions/rename.ts`
- Implement `renameSymbol` command.
- Find all references.
- Check for name collisions/shadowing.
- Dispatch transaction to replace text.

#### [NEW] `src/components/admin/pipelines/editor-modal/lua-extensions/code-actions.ts`
- Create `codeAction` extension.
- Provide fixes for diagnostics returned by the linter.

#### [NEW] `src/components/admin/pipelines/editor-modal/lua-extensions/outline.ts`
- Parse AST.
- Return tree structure of functions and variables.

#### [MODIFY] `src/components/admin/pipelines/editor-modal/lua-extensions/linter.ts`
- Add checks for assignments to known globals.
- Add checks for variable shadowing.

#### [MODIFY] `src/components/admin/pipelines/editor-modal/lua-extensions/hover.ts`
- Use rich type data from `type-inference.ts` to render popups.
