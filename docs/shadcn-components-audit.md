# shadcn/ui Component Audit & Enhancement Plan

This document audits the remaining "business-logic" UI components in `src/components/ui` and outlines the strategy to standardize them using shadcn/ui primitives.

## 1. Naming & Structure Cleanup (High Priority)
The current project has ambiguous naming for toggle components.

| Current File | Actual Behavior | shadcn/ui Equivalent | Action |
|--------------|-----------------|----------------------|--------|
| `src/components/ui/checkbox.tsx` | Toggle Switch | `Switch` | **Rename** to `switch.tsx`. Update all imports. |
| `src/components/ui/styled-checkbox.tsx` | Checkbox (Square) | `Checkbox` | **Rename** to `checkbox.tsx`. Refactor to use `@radix-ui/react-checkbox`. |

## 2. Component Enhancements

### 2.1. UserGroupPicker (`user-group-picker.tsx`)
*   **Current**: Custom `Modal` + `Input` + filtered list.
*   **Target**: `Dialog` + `Command` (Combobox).
*   **Plan**: 
    1.  Install `cmdk` (dependency for shadcn Command).
    2.  Create `src/components/ui/command.tsx` (shadcn standard).
    3.  Refactor `UserGroupPicker` to use `<Command>` for built-in filtering and keyboard navigation.

### 2.2. PermissionTagInput (`permission-tag-input.tsx`)
*   **Current**: Custom dropdown with tag list.
*   **Target**: `Popover` + `Command`.
*   **Plan**:
    1.  Create `src/components/ui/popover.tsx` (shadcn standard).
    2.  Implement a "Multi-select Combobox" pattern using `Command` inside `Popover`.
    3.  Use `Badge` for the selected permission tags.

### 2.3. WebhookSecretField (`webhook-secret-field.tsx`)
*   **Current**: Custom layout with warning banners.
*   **Target**: Standard Composition.
*   **Plan**:
    1.  Replace custom "warning box" div with `<Alert variant="warning">`.
    2.  Ensure `CopyableInput` uses the standard `Input`.
    3.  Ensure the confirmation modal uses standard `Dialog` (already done).

### 2.4. UrlListBuilder (`url-list-builder.tsx`)
*   **Current**: List of inputs.
*   **Target**: Standard Composition.
*   **Plan**:
    1.  Ensure inner `<Input>` and `<Button>` usage is compliant.
    2.  Consider using a `Table` if the list contains metadata, otherwise stack of `divs` is fine.

### 2.5. NavTabs (`nav-tabs.tsx`)
*   **Current**: `Link` styled as tabs.
*   **Target**: Consistent Styling.
*   **Plan**:
    1.  Update CSS classes to exactly match the `TabsTrigger` styles from `src/components/ui/tabs.tsx` to ensure visual consistency between "navigation tabs" and "content tabs".

## 3. New Primitives to Install

To support the above, we need to install:
*   `cmdk` (for Command/Combobox)
*   `@radix-ui/react-popover`
*   `@radix-ui/react-checkbox` (for the real checkbox)

## 4. Execution Order

1.  **Renaming**: Fix `checkbox` vs `switch` confusion.
2.  **Primitives**: Install and scaffold `Command`, `Popover`, `Checkbox`.
3.  **Refactoring**: Update the complex components (`UserGroupPicker`, `PermissionTagInput`) one by one.
