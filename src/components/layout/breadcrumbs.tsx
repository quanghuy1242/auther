"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { BreadcrumbItem } from "@/lib/types";
import { generateBreadcrumbs } from "@/lib/breadcrumbs";

export interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
}

/**
 * Breadcrumbs navigation component
 * Shows hierarchical navigation path
 * Auto-generates breadcrumbs from pathname if items not provided
 * 
 * @example
 * <Breadcrumbs /> // Auto-generate from current route
 * <Breadcrumbs items={[...]} /> // Use custom items
 */
export function Breadcrumbs({ items: customItems }: BreadcrumbsProps) {
  const pathname = usePathname();
  const items = customItems || generateBreadcrumbs(pathname);
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
