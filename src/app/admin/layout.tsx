import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  Sidebar,
  SidebarSection,
  SidebarNavItem,
  SidebarFooter,
  TopBar,
  TopBarLeft,
  TopBarRight,
  TopBarAutoRefresh,
  TopBarNotifications,
  TopBarUserMenu,
} from "@/components/layout";
import { LogoutButton } from "@/components/layout/logout-button";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import type { NavItem } from "@/lib/types";

// Force dynamic rendering for admin pages
export const dynamic = "force-dynamic";

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Users", href: "/admin/users", icon: "group" },
  { label: "OAuth Clients", href: "/admin/clients", icon: "apps" },
  { label: "Sessions", href: "/admin/sessions", icon: "schedule" },
  { label: "JWKS Keys", href: "/admin/keys", icon: "key" },
];

const settingsNavItems: NavItem[] = [
  { label: "Configuration", href: "/admin/settings", icon: "settings" },
];

const footerNavItems: NavItem[] = [
  { label: "Help Center", href: "/help", icon: "help" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get session and redirect if not authenticated
  const session = await getSession();
  
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="flex h-screen bg-[#111921]">
      {/* Sidebar */}
      <Sidebar>
        <SidebarSection>
          {mainNavItems.map((item) => (
            <SidebarNavItem key={item.href} item={item} />
          ))}
        </SidebarSection>

        <SidebarSection title="Settings">
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
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-[#243647] rounded-lg transition-colors"
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
      </Sidebar>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar>
          <TopBarLeft>
            <Breadcrumbs />
          </TopBarLeft>
          <TopBarRight>
            <TopBarAutoRefresh />
            <TopBarNotifications />
            <TopBarUserMenu user={session.user} />
          </TopBarRight>
        </TopBar>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
