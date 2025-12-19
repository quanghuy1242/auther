# Refactoring Plan: Lua Editor Extensions

## Goal Description
Analyze the `src/components/ui/code-editor/extensions/lua` directory to identify and plan refactoring improvements, focusing on code deduplication, cleanup, and modularization.

## User Review Required
- [ ] Review proposed refactoring list.

## Proposed Changes
## Proposed Changes

### Completion Refactoring (`handlers/completion.ts`)
The `completion.ts` file is currently monolithic (>1700 lines). It will be split into a modular structure:
#### [NEW] `src/components/ui/code-editor/extensions/lua/handlers/completion/`
- **`builder.ts`**: Extract `CompletionBuilder` class.
- **`providers/`**: Directory for individual providers:
    - `postfix.ts`: `PostfixProvider`
    - `function-args.ts`: `FunctionArgProvider` (Refactor to use shared inference)
    - `table-fields.ts`: `TableFieldProvider` (Refactor to use shared inference)
    - `equality.ts`: `EqualityProvider`
    - `doc-tags.ts`: `DocTagProvider`
    - `keywords.ts`: `KeywordsProvider` (and others)
- **`index.ts`**: Main entry point `getCompletions` that aggregates these providers.

### Hover Refactoring (`handlers/hover.ts`)
The `hover.ts` file contains duplicate inference logic. It will be refactored:
#### [NEW] `src/components/ui/code-editor/extensions/lua/handlers/hover/`
- **`builder.ts`**: Extract `HoverBuilder`.
- **`index.ts`**: Main `getHover` logic.
- **`utils.ts`**: Helper functions.

#### [MODIFY] logic in `hover.ts` (moved to `handlers/hover/index.ts`)
- Remove internal `inferExpressionType` and `inferTableConstructorType`.
- Update usage to rely on `AnalysisResult.types` or `analysis/infer/*.ts` modules to avoid logic duplication with `Analyzer`.

### Analysis Refactoring
- Review `analysis/analyzer.ts` to ensure it exposes necessary inference capabilities for `hover` and `completion` so they don't need to re-implement them.

## Verification Plan
1.  **Types & Lint**: Ensure no compilation errors.
2.  **Functionality**:
    - **Completion**: Verify dot completion, table field completion, function args completion work as before.
    - **Hover**: Verify hovering over variables, functions, and table fields shows correct types and docs.
    - **Inference**: Verify complex types (tables, functions) are still inferred correctly.

