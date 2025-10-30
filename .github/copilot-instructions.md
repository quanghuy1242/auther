## Notes

- Always make sure `pnpm build` and `pnpm lint` pass without errors.
- Follow the established coding style and conventions used in the repository.
- When writing backend code actions for UI components, ensure using auth object from `lib/auth.ts`, avoid using `db` call directly. If there's any way around, prefer that.

## Context7 Usage

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.

## Guiding Principles

### 1. **Centralize, Don't Duplicate** ⭐

- **NEVER scatter utility logic** across feature folders or components
- **ALWAYS check for existing utilities** before writing new helper functions
- If a utility doesn't exist, create it in the appropriate shared location
- Follow the principle: **Write once, import everywhere**
- **Component reusability is MANDATORY** - extract shared UI patterns into `src/components/`

### 2. **Extend Over Inline** ⭐

- **ALWAYS look for existing utilities** that can be extended
- **NEVER write inline functions** when a centralized helper exists or can be created
- Prefer updating a centralized helper over writing inline logic
- If an edge case isn't covered, enhance the utility rather than work around it
- Inline functions should be the last resort, not the first choice

### 3. **Design for Reusability** ⭐

- Write utilities that are:
  - **Side-effect free** - Pure functions wherever possible
  - **Type-safe** - Leverage TypeScript for compile-time safety
  - **Defensive** - Handle malformed input gracefully
  - **Composable** - Small, focused functions that work together
- **Extract repeated patterns immediately** - Don't wait for the third occurrence

### 4. Follow Established Patterns

- Study existing implementations before creating new features
- Reuse design patterns consistently across the codebase
- **When you see a pattern repeated 2+ times, extract it into a utility/component**
- Document patterns so future implementations stay consistent

### 5. Keep Dependencies Shallow

- Utilities should only depend on:
  - Other utilities
  - Standard library features
  - Core framework primitives
- **Never** make utilities depend on feature-specific modules
- This keeps the dependency graph clean and prevents circular dependencies