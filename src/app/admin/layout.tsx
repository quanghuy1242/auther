import * as React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/auth-utils";
import { AdminLayoutClient } from "./layout-client";
import type { NavItem } from "@/lib/types";

// Force dynamic rendering for admin pages
export const dynamic = "force-dynamic";

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Users", href: "/admin/users", icon: "group" },
  { label: "Groups", href: "/admin/groups", icon: "groups" },
  { label: "OAuth Clients", href: "/admin/clients", icon: "apps" },
  { label: "Auth Spaces", href: "/admin/authorization-spaces", icon: "category" },
  { label: "Resource Servers", href: "/admin/resource-servers", icon: "dns" },
  { label: "Sessions", href: "/admin/sessions", icon: "schedule" },
  { label: "JWKS Keys", href: "/admin/keys", icon: "key" },
  { label: "Webhooks", href: "/admin/webhooks", icon: "webhook" },
  { label: "Pipelines", href: "/admin/pipelines", icon: "account_tree" },
];

const settingsNavItems: NavItem[] = [
  { label: "Access", href: "/admin/access", icon: "shield" },
  { label: "Requests", href: "/admin/requests", icon: "approval" },
  { label: "Configuration", href: "/admin/settings", icon: "settings" },
];

const profileOnlySettingsNavItems: NavItem[] = [
  { label: "Profile", href: "/admin/profile", icon: "person" },
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

  const hasAdminAccess = await isAdmin(session);

  return (
    <AdminLayoutClient
      mainNavItems={hasAdminAccess ? mainNavItems : []}
      settingsNavItems={hasAdminAccess ? settingsNavItems : profileOnlySettingsNavItems}
      footerNavItems={footerNavItems}
      user={session.user}
    >
      {children}
    </AdminLayoutClient>
  );
}
