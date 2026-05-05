"use client";

import { NavTabs, type NavTab } from "@/components/ui/nav-tabs";

type SpaceDetailTabsProps = {
  spaceId: string;
};

export function SpaceDetailTabs({ spaceId }: SpaceDetailTabsProps) {
  const tabs: NavTab[] = [
    {
      label: "Overview",
      href: `/admin/authorization-spaces/${spaceId}`,
      icon: "info",
    },
    {
      label: "Access",
      href: `/admin/authorization-spaces/${spaceId}/access`,
      icon: "security",
    },
  ];

  return <NavTabs tabs={tabs} />;
}
