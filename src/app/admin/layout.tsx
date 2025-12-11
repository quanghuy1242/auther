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
  { label: "Sessions", href: "/admin/sessions", icon: "schedule" },
  { label: "JWKS Keys", href: "/admin/keys", icon: "key" },
  { label: "Webhooks", href: "/admin/webhooks", icon: "webhook" },
  { label: "Pipelines", href: "/admin/pipelines", icon: "account_tree" },
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

  // Require admin role to access admin dashboard
  const hasAdminAccess = await isAdmin(session);
  if (!hasAdminAccess) {
    // Redirect to a forbidden page or sign-in with error
    redirect("/sign-in?error=forbidden");
  }

  return (
    <AdminLayoutClient
      mainNavItems={mainNavItems}
      settingsNavItems={settingsNavItems}
      footerNavItems={footerNavItems}
      user={session.user}
    >
      {children}
    </AdminLayoutClient>
  );
}
