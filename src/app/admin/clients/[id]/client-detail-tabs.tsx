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
  ];

  return <NavTabs tabs={tabs} />;
}