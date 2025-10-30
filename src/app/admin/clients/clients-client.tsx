"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge, Button, Input } from "@/components/ui";
import type { GetClientsResult } from "./actions";

interface ClientsClientProps {
  initialData: GetClientsResult;
}

export function ClientsClient({ initialData }: ClientsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const isInitialMount = React.useRef(true);
  
  const filterType = (searchParams.get("type") as "all" | "trusted" | "dynamic") || "all";

  // Initialize search from URL params only on mount
  React.useEffect(() => {
    if (isInitialMount.current) {
      setSearch(searchParams.get("search") || "");
      isInitialMount.current = false;
    }
  }, [searchParams]);

  const formatDate = (date: Date | null) => {
    if (!date) return "Never";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  };

  const getClientType = (userId: string | null): "trusted" | "dynamic" => {
    return userId ? "trusted" : "dynamic";
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
        router.push(`/admin/clients?${params.toString()}`);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, router]);

  const handleFilterChange = (type: "all" | "trusted" | "dynamic") => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "all") {
      params.delete("type");
    } else {
      params.set("type", type);
    }
    params.set("page", "1"); // Reset to page 1 on filter change
    startTransition(() => {
      router.push(`/admin/clients?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/admin/clients?${params.toString()}`);
    });
  };

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-grow min-w-[300px]">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              type="text"
              placeholder="Search by client name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={filterType === "all" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleFilterChange("all")}
              disabled={isPending}
            >
              All
            </Button>
            <Button
              variant={filterType === "trusted" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleFilterChange("trusted")}
              disabled={isPending}
            >
              Trusted
            </Button>
            <Button
              variant={filterType === "dynamic" ? "primary" : "secondary"}
              size="sm"
              onClick={() => handleFilterChange("dynamic")}
              disabled={isPending}
            >
              Dynamic
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
                  Client Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Redirect URIs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-[#93adc8] uppercase tracking-wider">
                  Created
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#1a2632] divide-y divide-[#344d65]">
              {initialData.clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    No OAuth clients found
                  </td>
                </tr>
              ) : (
                initialData.clients.map((client) => {
                  const clientType = getClientType(client.userId);
                  return (
                    <tr key={client.id} className="hover:bg-[#243647]">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-white">
                            {client.name || "Unnamed Client"}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            {client.clientId}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Badge
                          variant={clientType === "trusted" ? "success" : "default"}
                        >
                          {clientType === "trusted" ? (
                            <span className="flex items-center gap-1">
                              <Icon name="lock" className="text-xs" />
                              Trusted
                            </span>
                          ) : (
                            "Dynamic"
                          )}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#93adc8]">
                        <div className="flex flex-col gap-1">
                          {client.redirectURLs.length === 0 ? (
                            <span className="text-gray-500">No redirect URIs</span>
                          ) : (
                            <>
                              <span>{client.redirectURLs[0]}</span>
                              {client.redirectURLs.length > 1 && (
                                <span className="text-xs text-gray-500">
                                  +{client.redirectURLs.length - 1} more
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#93adc8]">
                        {formatDate(client.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          href={`/admin/clients/${client.clientId}`}
                          className="text-[#1773cf] hover:text-[#1773cf]/80"
                        >
                          <Icon name="more_horiz" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
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
            {initialData.clients.length > 0
              ? (initialData.page - 1) * initialData.pageSize + 1
              : 0}
          </span>{" "}
          to{" "}
          <span className="font-medium text-white">
            {Math.min(initialData.page * initialData.pageSize, initialData.total)}
          </span>{" "}
          of <span className="font-medium text-white">{initialData.total}</span>{" "}
          results
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
