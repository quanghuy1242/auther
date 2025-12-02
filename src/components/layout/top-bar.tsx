"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { Dropdown } from "@/components/ui/dropdown";
import type { SessionUser } from "@/lib/session";
import { getUserDisplayName, getUserInitials } from "@/lib/session-utils";
import { signOut } from "@/app/admin/actions";

export interface TopBarProps {
  children?: React.ReactNode;
}

/**
 * TopBar component for page header
 * Contains auto-refresh toggle, notifications, and user profile
 */
export function TopBar({ children }: TopBarProps) {
  return (
    <header className="h-16 bg-[#1a2632] border-b border-[#243647] px-6 flex items-center justify-between">
      {children}
    </header>
  );
}

export function TopBarLeft({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-4">{children}</div>;
}

export function TopBarRight({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3">{children}</div>;
}

export function TopBarUserMenu({ user }: { user?: SessionUser }) {
  const router = useRouter();

  // Fallback for when user is not provided
  const displayName = user ? getUserDisplayName(user) : "Loading...";
  const email = user?.email || "";
  const initials = user ? getUserInitials(user) : "?";
  const avatarUrl = user?.image;

  return (
    <Dropdown
      trigger={
        <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hover-primary transition-colors">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#1773cf] flex items-center justify-center">
              <span className="text-white text-sm font-medium">{initials}</span>
            </div>
          )}
          <div className="text-left hidden md:block">
            <p className="text-sm font-medium text-white">{displayName}</p>
            <p className="text-xs text-gray-400">{email}</p>
          </div>
          <Icon name="expand_more" size="sm" className="text-gray-400" />
        </button>
      }
      items={[
        {
          label: "Profile Settings",
          icon: "person",
          onClick: () => router.push("/admin/profile"),
        },
        {
          label: "Account Security",
          icon: "security",
          onClick: () => router.push("/admin/security"),
        },
        {
          label: "API Keys",
          icon: "key",
          onClick: () => router.push("/admin/api-keys"),
        },
        { separator: true },
        {
          label: "Documentation",
          icon: "description",
          onClick: () => window.open("https://docs.better-auth.com", "_blank"),
        },
        {
          label: "Support",
          icon: "help",
          onClick: () => router.push("/help"),
        },
        { separator: true },
        {
          label: "Sign Out",
          icon: "logout",
          onClick: async () => {
            await signOut();
          },
          danger: true,
        },
      ]}
    />
  );
}

export function TopBarNotifications() {
  const [count] = React.useState(3);

  return (
    <button className="relative p-2 rounded-lg hover:bg-hover-primary transition-colors">
      <Icon name="notifications" size="sm" className="text-gray-400" />
      {count > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
      )}
    </button>
  );
}

export function TopBarAutoRefresh() {
  const [enabled, setEnabled] = React.useState(false);

  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
        ${enabled ? "bg-[#1773cf]/20 text-[#1773cf]" : "bg-[#243647] text-gray-400 hover:text-white"}
      `}
    >
      <Icon name="refresh" size="sm" />
      <span className="hidden sm:inline">Auto Refresh</span>
    </button>
  );
}
