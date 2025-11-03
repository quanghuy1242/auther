"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge, Button, Input, ResponsiveTable } from "@/components/ui";
import { formatDateShort } from "@/lib/utils/date-formatter";
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

  const getProviderIcon = (providerId: string) => {
    const icons: Record<string, string> = {
      google: "https://www.google.com/favicon.ico",
      github: "https://github.com/favicon.ico",
      credential: "mail",
    };
    return icons[providerId] || "key";
  };

  // Debounced search effect
  const debouncedSearch = React.useCallback((searchValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (searchValue) {
      params.set("search", searchValue);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // Reset to page 1 on search
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  }, [searchParams, router]);

  React.useEffect(() => {
    if (isInitialMount.current) return; // Skip on initial mount
    
    const timer = setTimeout(() => {
      debouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

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
          <div className="relative flex-grow min-w-full sm:min-w-[300px]">
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
          <div className="flex flex-wrap items-center gap-2">
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

      {/* Responsive Table */}
      <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-[#344d65]">
        <ResponsiveTable
          columns={[
            {
              key: "email",
              header: "Email",
              render: (user) => (
                <span className="text-sm font-medium text-white">{user.email}</span>
              ),
            },
            {
              key: "name",
              header: "Full Name",
              render: (user) => (
                <span className="text-sm text-[#93adc8]">{user.name}</span>
              ),
            },
            {
              key: "createdAt",
              header: "Date Created",
              render: (user) => (
                <span className="text-sm text-[#93adc8]">{formatDateShort(user.createdAt)}</span>
              ),
            },
            {
              key: "status",
              header: "Status",
              render: (user) => (
                <Badge variant={user.emailVerified ? "success" : "warning"}>
                  {user.emailVerified ? "Verified" : "Unverified"}
                </Badge>
              ),
            },
            {
              key: "providers",
              header: "Providers",
              render: (user) => (
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
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (user) => (
                <Link
                  href={`/admin/users/${user.id}`}
                  className="text-[#1773cf] hover:text-[#1773cf]/80"
                >
                  <Icon name="more_horiz" />
                </Link>
              ),
              className: "text-right",
            },
          ]}
          data={initialData.users}
          keyExtractor={(user) => user.id}
          mobileCardRender={(user) => (
            <div className="rounded-lg p-4 border border-[#344d65] sm:border-0 space-y-3" style={{ backgroundColor: '#1a2632' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{user.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{user.email}</p>
                </div>
                <Badge variant={user.emailVerified ? "success" : "warning"}>
                  {user.emailVerified ? "Verified" : "Unverified"}
                </Badge>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#344d65]">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Providers:</span>
                  <div className="flex items-center gap-1">
                    {user.accounts.length === 0 ? (
                      <Icon name="mail" className="text-gray-400" size="sm" />
                    ) : (
                      user.accounts.map((account, idx) => (
                        <Icon
                          key={idx}
                          name={account.providerId === "credential" ? "mail" : getProviderIcon(account.providerId)}
                          className="text-gray-400"
                          size="sm"
                        />
                      ))
                    )}
                  </div>
                </div>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="inline-flex items-center gap-1 text-[#1773cf] hover:text-[#1773cf]/80 text-sm min-h-[44px] px-3"
                >
                  View <Icon name="chevron_right" size="sm" />
                </Link>
              </div>
              <div className="text-xs text-gray-500">
                Created {formatDateShort(user.createdAt)}
              </div>
            </div>
          )}
          emptyMessage="No users found"
        />
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
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
