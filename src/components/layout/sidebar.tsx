"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { NavItem } from "@/lib/types";

export interface SidebarProps {
  children?: React.ReactNode;
}

/**
 * Sidebar navigation component for admin layout
 * Contains logo, navigation items, and footer items
 */
export function Sidebar({ children }: SidebarProps) {
  return (
    <aside className="w-64 h-screen bg-sidebar border-r border-[#243647] flex flex-col">
      {/* Logo Section */}
      <div className="h-16 px-6 py-3 border-b border-[#243647]">
        <div className="flex items-center gap-3">
          <Icon name="lock" size="lg" className="text-primary" filled />
          <div>
            <h1 className="text-lg font-bold text-white">Better Auth</h1>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto py-4">
        {children}
      </div>
    </aside>
  );
}

export interface SidebarNavItemProps {
  item: NavItem;
  onNavigate?: () => void;
}

export function SidebarNavItem({ item, onNavigate }: SidebarNavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      prefetch={true}
      onClick={onNavigate}
      className={`
        flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors
        ${
          isActive
            ? "bg-[#243647] text-white border-r-2 border-primary"
            : "text-gray-400 hover:text-white hover:bg-hover-primary"
        }
      `}
    >
      {item.icon && <Icon name={item.icon} size="sm" />}
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="px-2 py-0.5 text-xs font-semibold bg-primary text-white rounded-full">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export interface SidebarSectionProps {
  title?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}

export function SidebarSection({ title, children, onNavigate }: SidebarSectionProps) {
  // Clone children and pass onNavigate prop
  const childrenWithProps = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, { onNavigate } as Partial<SidebarNavItemProps>);
    }
    return child;
  });
  return (
    <div className="mb-6">
      {title && (
        <div className="px-6 py-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
          </h3>
        </div>
      )}
      <nav>{childrenWithProps}</nav>
    </div>
  );
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-t border-[#243647]">
      {children}
    </div>
  );
}
