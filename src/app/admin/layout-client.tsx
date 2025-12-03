"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarSection,
  SidebarNavItem,
  SidebarFooter,
  TopBar,
  TopBarLeft,
  TopBarRight,
  TopBarUserMenu,
} from "@/components/layout";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { LogoutButton } from "@/components/layout/logout-button";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Icon } from "@/components/ui/icon";
import type { SessionUser } from "@/lib/session";
import type { NavItem } from "@/lib/types";

interface AdminLayoutClientProps {
  mainNavItems: NavItem[];
  settingsNavItems: NavItem[];
  footerNavItems: NavItem[];
  user: SessionUser;
  children: React.ReactNode;
}

export function AdminLayoutClient({
  mainNavItems,
  settingsNavItems,
  footerNavItems,
  user,
  children,
}: AdminLayoutClientProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleCloseDrawer = () => {
    setMobileMenuOpen(false);
  };

  // Render sidebar content with close handler
  const sidebarContent = (
    <>
      <SidebarSection onNavigate={handleCloseDrawer}>
        {mainNavItems.map((item) => (
          <SidebarNavItem key={item.href} item={item} />
        ))}
      </SidebarSection>

      <SidebarSection title="Settings" onNavigate={handleCloseDrawer}>
        {settingsNavItems.map((item) => (
          <SidebarNavItem key={item.href} item={item} />
        ))}
      </SidebarSection>

      <SidebarFooter>
        <div className="space-y-1">
          {footerNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleCloseDrawer}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-hover-primary rounded-lg transition-colors"
            >
              {item.icon && (
                <span className="material-symbols-outlined text-[18px]">
                  {item.icon}
                </span>
              )}
              {item.label}
            </Link>
          ))}
          <LogoutButton />
        </div>
      </SidebarFooter>
    </>
  );

  return (
    <div className="flex h-screen bg-[#111921]">
      {/* Desktop Sidebar - Hidden on mobile */}
      <div className="hidden lg:block">
        <Sidebar>{sidebarContent}</Sidebar>
      </div>

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={handleCloseDrawer}
      >
        {sidebarContent}
      </MobileDrawer>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar>
          <TopBarLeft>
            {/* Mobile menu button */}
            <button
              type="button"
              className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-hover-primary hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#1773cf]"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span className="sr-only">Open menu</span>
              <Icon name="menu" className="h-6 w-6" />
            </button>
            <Breadcrumbs />
          </TopBarLeft>
          <TopBarRight>
            <TopBarUserMenu user={user} />
          </TopBarRight>
        </TopBar>

        {/* Page Content with responsive padding */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
