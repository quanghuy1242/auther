"use client";

import { NavTabs, NavTab } from "@/components/ui/nav-tabs";

interface ClientDetailTabsProps {
  clientId: string;
}

export function ClientDetailTabs({ clientId }: ClientDetailTabsProps) {
  const tabs: NavTab[] = [
    {
      label: "Overview",
      href: `/admin/clients/${clientId}`,
      icon: "info",
    },
    {
      label: "Access Control",
      href: `/admin/clients/${clientId}/access`,
      icon: "security",
    },
    {
      label: "Registration",
      href: `/admin/clients/${clientId}/registration`,
      icon: "person_add",
    },
    {
      label: "Requests",
      href: `/admin/clients/${clientId}/requests`,
      icon: "pending_actions",
    },
  ];

  return <NavTabs tabs={tabs} />;
}