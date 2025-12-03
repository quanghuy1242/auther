"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge, Button, ResponsiveTable, SearchInput, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/admin";
import { formatDateShort } from "@/lib/utils/date-formatter";
import type { GetUsersResult } from "./actions";
import { getProviderConfig } from "./shared";

interface UsersClientProps {
  initialData: GetUsersResult;
}

export function UsersClient({ initialData }: UsersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  
  const filterStatus = (searchParams.get("verified") === "true" ? "verified" : searchParams.get("verified") === "false" ? "unverified" : "all") as "all" | "verified" | "unverified";

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // Reset to page 1 on search
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  };

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
      <FilterBar>
        <div className="relative flex-grow min-w-full sm:min-w-[300px]">
          <SearchInput
            placeholder="Search by email, name, or username..."
            defaultValue={searchParams.get("search") || ""}
            onSearch={handleSearch}
            className="w-full"
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
      </FilterBar>

      {/* Responsive Table */}
      <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-border-dark">
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
                <span className="text-sm text-gray-400">{user.name}</span>
              ),
            },
            {
              key: "createdAt",
              header: "Date Created",
              render: (user) => (
                <span className="text-sm text-gray-400">{formatDateShort(user.createdAt)}</span>
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
                            name={getProviderConfig(account.providerId).icon}
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
            <div className="rounded-lg p-4 border border-border-dark sm:border-0 space-y-3 bg-card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{user.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{user.email}</p>
                </div>
                <Badge variant={user.emailVerified ? "success" : "warning"}>
                  {user.emailVerified ? "Verified" : "Unverified"}
                </Badge>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border-dark">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Providers:</span>
                  <div className="flex items-center gap-1">
                    {user.accounts.length === 0 ? (
                      <Icon name="mail" className="text-gray-400" size="sm" />
                    ) : (
                      user.accounts.map((account, idx) => (
                        <Icon
                          key={idx}
                          name={account.providerId === "credential" ? "mail" : getProviderConfig(account.providerId).icon}
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
      <Pagination
        currentPage={initialData.page}
        pageSize={initialData.pageSize}
        totalItems={initialData.total}
        totalPages={initialData.totalPages}
        onPageChange={handlePageChange}
        isPending={isPending}
      />
    </>
  );
}
