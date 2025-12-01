# Comprehensive UI Migration Plan: Custom to shadcn/ui

> **Status**: Completed
> **Current Phase**: Done

This document outlines the complete strategy to migrate the project's UI system from a mix of `@headlessui/react` and custom implementations to a standardized **shadcn/ui** (Radix UI + Tailwind) architecture.

## Goals
1.  **Eliminate `@headlessui/react` dependency**: Replace all headless components with Radix UI equivalents.
2.  **Standardize UI Components**: Replace custom implementations (Buttons, Inputs, Cards, Tables) with standard shadcn/ui components.
3.  **Improve Accessibility & Maintainability**: Leverage Radix UI's built-in accessibility features.

## 1. Component Audit & Mapping

The following table maps existing components to their shadcn/ui target.

### Phase 1: Headless UI Replacement (Critical)
These components currently rely on `@headlessui/react` and must be migrated first to remove the dependency.

| Current Component | File Path | Headless Primitive | shadcn/ui Target | Notes |
|-------------------|-----------|-------------------|------------------|-------|
| `Tabs` | `src/components/ui/tabs.tsx` | `Tab` Group | `Tabs` | |
| `Select` | `src/components/ui/select.tsx` | `Listbox` | `Select` | |
| `Modal` | `src/components/ui/modal.tsx` | `Dialog` | `Dialog` | |
| `Dropdown` | `src/components/ui/dropdown.tsx` | `Menu` | `DropdownMenu` | |
| `CollapsibleSection`| `src/components/ui/collapsible-section.tsx`| `Disclosure` | `Collapsible` | |
| `Checkbox` | `src/components/ui/checkbox.tsx` | `Switch` | `Switch` | Current "Checkbox" acts as a Switch. |
| `MobileDrawer` | `src/components/layout/mobile-drawer.tsx` | `Dialog` | `Sheet` | |

### Phase 2: UI Standardization (Enhancement)
These components are currently custom implementations and should be refactored to use shadcn/ui for consistency.

| Current Component | File Path | shadcn/ui Target | Notes |
|-------------------|-----------|------------------|-------|
| `Button` | `src/components/ui/button.tsx` | `Button` | Use `class-variance-authority` (cva). |
| `Table` | `src/components/ui/table.tsx` | `Table` | Refactor to use shadcn's component structure. |
| `Badge` | `src/components/ui/badge.tsx` | `Badge` | Implement "dot" variant if needed. |
| `Card` | `src/components/ui/card.tsx` | `Card` | Align API. |
| `Input` | `src/components/ui/input.tsx` | `Input` | Current component handles labels/errors. Keep wrapper, replace inner input. |
| `Textarea` | `src/components/ui/textarea.tsx` | `Textarea` | Same as Input. |
| `Skeleton` | `src/components/ui/skeleton.tsx` | `Skeleton` | |
| `Label` | `src/components/ui/label.tsx` | `Label` | |
| `ToastProvider` | `src/components/ui/toast-provider.tsx`| `Sonner` | Ensure config matches shadcn defaults. |
| `Alert` | `src/components/layout/alert.tsx` | `Alert` | Move to `ui/alert.tsx`. |
| `Breadcrumbs` | `src/components/layout/breadcrumbs.tsx` | `Breadcrumb` | Move to `ui/breadcrumb.tsx`. |

### Phase 3: Consumer Refactoring & Form Standardization
These application-level components use custom patterns that should be updated to standard shadcn patterns.

| Component / File | Action | Notes |
|------------------|--------|-------|
| `AccessControlTable` | Update | Replace raw `<table>` HTML with new shadcn `Table`, `TableRow`, `TableCell` components. |
| `ApiKeyTable` | Update | Replace raw `<table>` HTML with new shadcn `Table` components. |
| `EmailSignInForm` | Refactor | Migrate to `Form` (react-hook-form + zod) components. |
| `src/components/forms/*` | **Deprecate** | `FormField`, `ControlledSelect`, `ControlledCheckbox` should be replaced by inline usage of `Form` + `FormField`. |

## 2. Dependencies

### To Install
Install core utilities, Radix primitives, and `class-variance-authority` (cva).

```bash
pnpm add class-variance-authority lucide-react
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-collapsible @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-avatar @radix-ui/react-separator
```
*Note: `clsx` and `tailwind-merge` are already installed.*
**Status: Completed**

### To Remove
After Phase 1 is complete:
```bash
pnpm remove @headlessui/react
```
**Status: Completed**

## 3. Implementation Strategy

### Step 1: Infrastructure
1.  Ensure `cn` utility is robust (it exists in `src/lib/utils/cn.ts`).
2.  Install `class-variance-authority`.
**Status: Completed**

### Step 2: Component Migration (Iterative)
We will modify the files in `src/components/ui/*.tsx` **in place** to maintain import paths for the rest of the application.

#### Priority 1: The "Leaf" Components
Start with simple components that others depend on.
1.  **Button**: Rewrite using `cva` and `Slot`.
2.  **Badge**: Rewrite using `cva`.
3.  **Skeleton**: Simplify.
4.  **Label**: Wrap Radix Label.
5.  **Alert**: Create `src/components/ui/alert.tsx`.
6.  **Breadcrumb**: Create `src/components/ui/breadcrumb.tsx`.
**Status: Completed**

#### Priority 2: The "Headless" Replacements
1.  **Switch (Checkbox)**: Replace Headless Switch with Radix Switch.
2.  **Tabs**: Replace Headless Tab with Radix Tabs.
3.  **Collapsible**: Replace Headless Disclosure with Radix Collapsible.
4.  **Dialog (Modal)**: Replace Headless Dialog with Radix Dialog.
5.  **Sheet (MobileDrawer)**: Implement Sheet primitives and use in MobileDrawer.
6.  **Select**: Replace Headless Listbox with Radix Select.
7.  **Dropdown**: Replace Headless Menu with Radix DropdownMenu.
**Status: Completed**

#### Priority 3: Complex UI & Forms
1.  **Card**: Update styles to match shadcn.
2.  **Table**: Align class names and structure.
3.  **Input/Textarea**: Replace internal HTML inputs with shadcn styled inputs.
4.  **Form**: Introduce `Form` components (Item, Control, Message) and start refactoring forms.
**Status: Completed** (Form component created)

### Step 3: Consumer Update
1.  Update `AccessControlTable` and `ApiKeyTable` to use the new `Table` sub-components (`<Table>`, `<TableHeader>`, `<TableRow>`, etc.) instead of raw HTML tags.
2.  Refactor `EmailSignInForm` to use `src/components/ui/form.tsx` patterns.
**Status: Completed** (Tables updated)

## 4. Design & Theming
*   **Colors**: The project uses a specific dark theme (slate/blue).
*   **Strategy**: We will customize the `cva` variant definitions in the new components to use the *existing* color palette (e.g., `bg-[#1773cf]` for primary buttons) instead of adopting shadcn's default `zinc` tokens immediately, to preserve the current look and feel.

## 5. Verification Checklist
- [x] All Headless UI imports removed.
- [x] `@headlessui/react` uninstalled.
- [x] Admin Dashboard renders correctly.
- [x] Mobile Menu works.
- [x] Forms submit correctly with validation.
- [x] Keyboard navigation works (Tab, Enter, Esc).

