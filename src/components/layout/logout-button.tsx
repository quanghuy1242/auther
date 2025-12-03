"use client";

import { signOut } from "@/app/admin/actions";

export function LogoutButton() {
  const handleSignOut = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    await signOut();
  };

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-hover-primary rounded-lg transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">
        logout
      </span>
      Logout
    </button>
  );
}
