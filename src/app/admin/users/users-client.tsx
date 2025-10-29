"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Badge, Button, Input } from "@/components/ui";
import type { GetUsersResult } from "./actions";

interface UsersClientProps {
  initialData: GetUsersResult;
}

export function UsersClient({ initialData }: UsersClientProps) {
  const [search, setSearch] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<"all" | "verified" | "unverified">("all");

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
              onClick={() => setFilterStatus("all")}
            >
              All
            </Button>
            <Button
              variant={filterStatus === "verified" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilterStatus("verified")}
            >
              Verified
            </Button>
            <Button
              variant={filterStatus === "unverified" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setFilterStatus("unverified")}
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
            disabled={initialData.page <= 1}
            leftIcon="chevron_left"
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={initialData.page >= initialData.totalPages}
            rightIcon="chevron_right"
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
}
