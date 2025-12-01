# Layout Components Audit & Modernization Plan

This document audits the layout components in `src/components/layout` and outlines the strategy to modernize them using shadcn/ui patterns where appropriate.

## 1. Current State Analysis

| Component | Purpose | Current Implementation | shadcn/ui Equivalent | Recommendation |
|-----------|---------|------------------------|----------------------|----------------|
| `Sidebar` | Main Navigation | Custom `aside` + `Link` | `Sidebar` (new in shadcn) or Custom | **Keep Custom**. shadcn's Sidebar is complex and might be overkill if the current one works well. However, we can refine the *styling* to match. |
| `TopBar` | Header & Actions | Custom `header` + `flex` | `Navbar` / `Header` | **Keep Custom**. This is a structural layout piece. |
| `MobileDrawer` | Mobile Menu | Custom wrapper around Radix Dialog | `Sheet` | **Refactor to use `Sheet`**. We already migrated the internals to Radix Dialog, but switching to the standard `Sheet` component (which *is* a wrapper around Radix Dialog) standardizes the codebase. |
| `PageHeading` | Title & Actions | Custom `div` structure | - | **Keep Custom**. This is a specific layout pattern for your app. |
| `Breadcrumbs` | Navigation | Custom wrapper | `Breadcrumb` | **Done**. We already migrated this to use `ui/breadcrumb.tsx`. |

## 2. Detailed Plan

### 2.1. MobileDrawer -> Sheet
*   **Goal**: Replace the custom Radix Dialog implementation in `mobile-drawer.tsx` with the standard shadcn `Sheet` component.
*   **Steps**:
    1.  Create `src/components/ui/sheet.tsx` (copy standard shadcn code).
    2.  Update `MobileDrawer` to import and use `Sheet`, `SheetContent`, `SheetTrigger`, etc.
    3.  Ensure the styling (dark mode, background colors) matches the existing drawer.

### 2.2. Sidebar & TopBar Refinement
*   **Goal**: Ensure they use standard design tokens (colors, spacing) consistent with the rest of the shadcn migration.
*   **Steps**:
    *   Check `Sidebar` colors against `bg-sidebar` / `border-border` variables.
    *   Check `TopBar` colors.
    *   Ensure `Dropdown` in `TopBarUserMenu` is working correctly with the new Radix implementation (it should be, as we migrated `Dropdown` already).

## 3. Execution Order

1.  **Scaffold**: Create `src/components/ui/sheet.tsx`.
2.  **Refactor**: Update `MobileDrawer` to use `Sheet`.
3.  **Verify**: Check mobile responsiveness and menu behavior.

