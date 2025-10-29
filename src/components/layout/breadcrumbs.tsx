import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { BreadcrumbItem } from "@/lib/types";

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * Breadcrumbs navigation component
 * Shows hierarchical navigation path
 * 
 * @example
 * <Breadcrumbs items={[
 *   { label: 'Admin', href: '/admin' },
 *   { label: 'Users', href: '/admin/users' },
 *   { label: 'John Doe' }
 * ]} />
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center space-x-2 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        
        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <Icon name="chevron_right" size="sm" className="text-gray-500" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-white font-medium" : "text-gray-400"}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
