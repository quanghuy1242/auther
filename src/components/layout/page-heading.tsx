import * as React from "react";
import { Breadcrumbs } from "./breadcrumbs";
import type { BreadcrumbItem } from "@/lib/types";

export interface PageHeadingProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[] | boolean; // false to hide, true to auto-generate, or custom items
}

/**
 * PageHeading component for page titles and descriptions
 * Optionally includes action buttons and breadcrumbs
 * 
 * @example
 * <PageHeading
 *   title="User Management"
 *   description="Manage system users and permissions"
 *   action={<Button leftIcon="add">Create User</Button>}
 *   breadcrumbs={true} // Auto-generate breadcrumbs
 * />
 */
export function PageHeading({ title, description, action, children, breadcrumbs }: PageHeadingProps) {
  const showBreadcrumbs = breadcrumbs !== false;
  
  return (
    <div className="mb-6">
      {showBreadcrumbs && (
        <div className="mb-3">
          <Breadcrumbs items={Array.isArray(breadcrumbs) ? breadcrumbs : undefined} />
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-400">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
