import * as React from "react";

export interface PageHeadingProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * PageHeading component for page titles and descriptions
 * Optionally includes action buttons
 * 
 * @example
 * <PageHeading
 *   title="User Management"
 *   description="Manage system users and permissions"
 *   action={<Button leftIcon="add">Create User</Button>}
 * />
 */
export function PageHeading({ title, description, action, children }: PageHeadingProps) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-gray-400">{description}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
