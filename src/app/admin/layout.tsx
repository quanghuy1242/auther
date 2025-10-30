import * as React from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AdminLayoutClient } from "./layout-client";
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
