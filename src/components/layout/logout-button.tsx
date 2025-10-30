"use client";

import { signOut } from "@/app/admin/actions";

export function LogoutButton() {
  const handleSignOut = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    await signOut();
  };

  return (
    <a
      href="#"
      onClick={handleSignOut}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-[#243647] rounded-lg transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">
        logout
      </span>
      Logout
    </a>
  );
}
