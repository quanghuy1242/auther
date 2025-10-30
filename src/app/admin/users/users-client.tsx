"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge, Button, Input } from "@/components/ui";
import type { GetUsersResult } from "./actions";

interface UsersClientProps {
  initialData: GetUsersResult;
}

export function UsersClient({ initialData }: UsersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const isInitialMount = React.useRef(true);
  
  const filterStatus = (searchParams.get("verified") === "true" ? "verified" : searchParams.get("verified") === "false" ? "unverified" : "all") as "all" | "verified" | "unverified";

  // Initialize search from URL params only on mount
  React.useEffect(() => {
    if (isInitialMount.current) {
      setSearch(searchParams.get("search") || "");
      isInitialMount.current = false;
    }
  }, [searchParams]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  };

  const getProviderIcon = (providerId: string) => {
    const icons: Record<string, string> = {
      google: "https://www.google.com/favicon.ico",
      github: "https://github.com/favicon.ico",
      credential: "mail",
    };
    return icons[providerId] || "key";
  };

  // Debounced search effect
  React.useEffect(() => {
    if (isInitialMount.current) return; // Skip on initial mount
    
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) {
        params.set("search", search);
      } else {
        params.delete("search");
      }
      params.set("page", "1"); // Reset to page 1 on search
      startTransition(() => {
        router.push(`/admin/users?${params.toString()}`);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, router]);

  const handleFilterChange = (status: "all" | "verified" | "unverified") => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "verified") {
      params.set("verified", "true");
    } else if (status === "unverified") {
      params.set("verified", "false");
    } else {
      params.delete("verified");
    }
    params.set("page", "1"); // Reset to page 1 on filter change
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  };

  return (
    <>
      {/* Control Bar */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-grow min-w-[300px]">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              type="text"
              placeholder="Search by email, name, or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={filterStatus === "all" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleFilterChange("all")}
              disabled={isPending}
            >
              All
            </Button>
            <Button
              variant={filterStatus === "verified" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleFilterChange("verified")}
              disabled={isPending}
            >
              Verified
            </Button>
            <Button
              variant={filterStatus === "unverified" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleFilterChange("unverified")}
              disabled={isPending}
            >
              Unverified
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[#344d65]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#344d65]">
            <thead className="bg-[#1a2632]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Full Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Date Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Providers
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#111921] divide-y divide-[#344d65]">
              {initialData.users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                initialData.users.map((user) => (
                  <tr key={user.id} className="hover:bg-primary/10">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#93adc8]">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#93adc8]">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Badge
                        variant={user.emailVerified ? "success" : "warning"}
                      >
                        {user.emailVerified ? "Verified" : "Unverified"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {user.accounts.length === 0 ? (
                          <Icon name="mail" className="text-gray-400" />
                        ) : (
                          user.accounts.map((account, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1"
                              title={`${account.providerId} - ${account.accountId}`}
                            >
                              {account.providerId === "credential" ? (
                                <Icon name="mail" className="text-gray-400" />
                              ) : (
                                <Icon
                                  name={getProviderIcon(account.providerId)}
                                  className="text-gray-400"
                                />
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="text-[#1773cf] hover:text-[#1773cf]/80"
                      >
                        <Icon name="more_horiz" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-[#93adc8]">
          Showing{" "}
          <span className="font-medium text-white">
            {initialData.users.length > 0 ? (initialData.page - 1) * initialData.pageSize + 1 : 0}
          </span>{" "}
          to{" "}
          <span className="font-medium text-white">
            {Math.min(initialData.page * initialData.pageSize, initialData.total)}
          </span>{" "}
          of <span className="font-medium text-white">{initialData.total}</span> results
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={initialData.page <= 1 || isPending}
            leftIcon="chevron_left"
            onClick={() => handlePageChange(initialData.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={initialData.page >= initialData.totalPages || isPending}
            rightIcon="chevron_right"
            onClick={() => handlePageChange(initialData.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
