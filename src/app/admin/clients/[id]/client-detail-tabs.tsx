"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

interface ClientDetailTabsProps {
  clientId: string;
}

interface Tab {
  label: string;
  href: string;
  icon: string;
}

export function ClientDetailTabs({ clientId }: ClientDetailTabsProps) {
  const pathname = usePathname();
  
  const tabs: Tab[] = [
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
      label: "API Keys",
      href: `/admin/clients/${clientId}/api-keys`,
      icon: "key",
    },
  ];

  return (
    <div className="border-b border-slate-800 mb-6">
      <nav className="flex gap-1" aria-label="Client navigation tabs">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative",
                "hover:text-white hover:bg-slate-800/50 rounded-t-lg",
                isActive
                  ? "text-white bg-slate-800/70"
                  : "text-[#93adc8]"
              )}
            >
              <span className="material-symbols-outlined text-lg">
                {tab.icon}
              </span>
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
