import * as React from "react";
import Link from "next/link";
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
    <aside className="w-64 h-screen bg-[#1a2632] border-r border-[#243647] flex flex-col">
      {/* Logo Section */}
      <div className="px-6 py-5 border-b border-[#243647]">
        <div className="flex items-center gap-3">
          <Icon name="lock" size="lg" className="text-[#1773cf]" filled />
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
  isActive?: boolean;
}

export function SidebarNavItem({ item, isActive }: SidebarNavItemProps) {
  return (
    <Link
      href={item.href}
      className={`
        flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors
        ${
          isActive
            ? "bg-[#243647] text-white border-r-2 border-[#1773cf]"
            : "text-gray-400 hover:text-white hover:bg-[#243647]/50"
        }
      `}
    >
      {item.icon && <Icon name={item.icon} size="sm" />}
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="px-2 py-0.5 text-xs font-semibold bg-[#1773cf] text-white rounded-full">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

export interface SidebarSectionProps {
  title?: string;
  children: React.ReactNode;
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="mb-6">
      {title && (
        <div className="px-6 py-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {title}
          </h3>
        </div>
      )}
      <nav>{children}</nav>
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
