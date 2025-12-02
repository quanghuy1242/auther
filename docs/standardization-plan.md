# Standardization and Component Reuse Plan

## Objective
Standardize the codebase by ensuring all pages in `src/app/admin` utilize shared UI components, eliminating custom `div` wrappers, hardcoded styles, and code duplication.

## Current State Analysis

### Identified Issues
1.  **Inconsistent Layout Containers**:
    -   Pages repeatedly use `<div className="max-w-6xl mx-auto">` or similar hardcoded max-widths.
    -   **Fix**: Introduce a `PageContainer` component.

2.  **Hardcoded Colors & Styles**:
    -   Frequent use of hex codes (e.g., `#1773cf`, `#344d65`, `#1a2632`) directly in components and pages.
    -   **Fix**: Refactor to use Tailwind utility classes mapped to a theme (e.g., `bg-card`, `border-border`).

3.  **Repeated UI Patterns (Not Componentized)**:
    -   **Search & Filters**: `UsersClient` and other clients implement search inputs and filter buttons manually using raw `Input` and `Button` components with repetitive styling.
    -   **Pagination**: Pagination controls are manually implemented in each client component.
    -   **Mobile Cards**: Custom inline styles and structures for mobile views in `ResponsiveTable` props.
    -   **Empty States**: Custom divs for success/empty states.
    -   **Stat/Info Cards**: Dashboard uses repeated card structures that should be a reusable `StatCard`.

4.  **Component Limitations**:
    -   `ResponsiveTable` contains hardcoded colors and does not support pagination internally or via a standard footer prop.

## Action Plan

### Phase 1: Extract & Refactor Shared Components

Create or update the following components in `src/components/ui` or `src/components/admin`:

1.  **`PageContainer`**
    -   Wraps page content with standard max-width and padding.
    -   *Usage*: Replace top-level divs in all admin pages.

2.  **`SearchInput` / `FilterBar`**
    -   Encapsulates the search icon, input field, and optional debounce logic.
    -   Standardizes the "Control Bar" layout seen in `UsersClient`.

3.  **`Pagination`**
    -   Standard component for "Previous", "Next", and "Showing X of Y results".
    -   Should be easily composable with tables.

4.  **`StatCard`** (for Dashboard)
    -   Standardizes the icon + label + value + trend layout.

5.  **`EmptyState` / `StatusFeedback`**
    -   Reusable component for "No results found" or "Success!" messages with icons.

### Phase 2: Refactor `ResponsiveTable`

1.  **Remove Hardcoded Colors**: Replace `#1a2632`, `#344d65` with semantic Tailwind classes (e.g., `bg-card`, `divide-border`).
2.  **Standardize Mobile View**: Provide a better default mobile view or a structured helper so consumers don't need to write full inline-styled divs.

### Phase 3: Implement in Admin Pages

Refactor the following pages to use the new components:

1.  **`src/app/admin/users`**:
    -   Replace Search/Filter section with `FilterBar`.
    -   Replace manual pagination with `Pagination`.
    -   Update `ResponsiveTable` usage.

2.  **`src/app/admin/dashboard`**:
    -   Refactor "Quick Stats" to use `StatCard`.
    -   Refactor "Recent Activity" to use a `List` or `ActivityItem` component.

3.  **`src/app/admin/clients` & `webhooks`**:
    -   Apply similar standardizations as Users page.

### Phase 4: Design System Cleanup (Ongoing)

-   Audit `tailwind.config.js` to ensure all hardcoded colors found in the analysis have corresponding utility classes.
-   Enforce usage of these classes via linting or code reviews (future step).

## Success Metrics
-   Reduction of distinct CSS hex codes in `src/app/admin`.
-   Reduction of lines of code in `*-client.tsx` files.
-   Visual consistency across all Admin pages.
