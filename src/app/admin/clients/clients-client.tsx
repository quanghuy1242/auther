"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Badge, Button, ResponsiveTable, SearchInput, Pagination } from "@/components/ui";
import { FilterBar } from "@/components/admin";
import { formatDate } from "@/lib/utils/date-formatter";
import type { GetClientsResult } from "./actions";

interface ClientsClientProps {
  initialData: GetClientsResult;
}

export function ClientsClient({ initialData }: ClientsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  
  const filterType = (searchParams.get("type") as "all" | "trusted" | "dynamic") || "all";

  const getClientType = (userId: string | null): "trusted" | "dynamic" => {
    return userId ? "trusted" : "dynamic";
  };

  const handleSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("search", value);
    } else {
      params.delete("search");
    }
    params.set("page", "1"); // Reset to page 1 on search
    startTransition(() => {
      router.push(`/admin/clients?${params.toString()}`);
    });
  };

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
      <FilterBar>
        <div className="relative flex-grow min-w-[300px]">
          <SearchInput
            placeholder="Search by client name..."
            defaultValue={searchParams.get("search") || ""}
            onSearch={handleSearch}
            className="w-full"
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
      </FilterBar>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-border-dark sm:bg-card">
        <ResponsiveTable
          columns={[
            {
              key: "name",
              header: "Client Name",
              render: (client) => (
                <div>
                  <p className="text-sm font-medium text-white">
                    {client.name || "Unnamed Client"}
                  </p>
                  <p className="text-xs text-gray-400 font-mono">
                    {client.clientId}
                  </p>
                </div>
              ),
            },
            {
              key: "type",
              header: "Type",
              render: (client) => {
                const clientType = getClientType(client.userId);
                return (
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
                );
              },
            },
            {
              key: "redirectURLs",
              header: "Redirect URIs",
              render: (client) => (
                <div className="flex flex-col gap-1">
                  {client.redirectURLs.length === 0 ? (
                    <span className="text-gray-500">No redirect URIs</span>
                  ) : (
                    <>
                      <span className="text-sm text-gray-400">{client.redirectURLs[0]}</span>
                      {client.redirectURLs.length > 1 && (
                        <span className="text-xs text-gray-500">
                          +{client.redirectURLs.length - 1} more
                        </span>
                      )}
                    </>
                  )}
                </div>
              ),
            },
            {
              key: "createdAt",
              header: "Created",
              render: (client) => (
                <span className="text-sm text-gray-400">{formatDate(client.createdAt)}</span>
              ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (client) => (
                <Link
                  href={`/admin/clients/${client.clientId}`}
                  className="text-[#1773cf] hover:text-[#1773cf]/80 inline-block"
                >
                  <Icon name="more_horiz" />
                </Link>
              ),
            },
          ]}
          data={initialData.clients}
          keyExtractor={(client) => client.id}
          mobileCardRender={(client) => {
            const clientType = getClientType(client.userId);
            return (
              <Link href={`/admin/clients/${client.clientId}`}>
                <div className="rounded-lg p-4 space-y-3 border border-border-dark hover:border-[#1773cf] transition-colors bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {client.name || "Unnamed Client"}
                      </p>
                      <p className="text-xs text-gray-400 font-mono truncate mt-1">
                        {client.clientId}
                      </p>
                    </div>
                    <Badge
                      variant={clientType === "trusted" ? "success" : "default"}
                      className="flex-shrink-0"
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
                  </div>

                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Redirect URIs</p>
                      {client.redirectURLs.length === 0 ? (
                        <p className="text-sm text-gray-500">No redirect URIs</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-sm text-gray-400 truncate">{client.redirectURLs[0]}</p>
                          {client.redirectURLs.length > 1 && (
                            <p className="text-xs text-gray-500">
                              +{client.redirectURLs.length - 1} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border-dark">
                      <div>
                        <p className="text-xs text-gray-400 uppercase">Created</p>
                        <p className="text-sm text-gray-400 mt-0.5">{formatDate(client.createdAt)}</p>
                      </div>
                      <Icon name="chevron_right" className="text-[#1773cf]" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          }}
          emptyMessage="No OAuth clients found"
        />
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={initialData.page}
        pageSize={initialData.pageSize}
        totalItems={initialData.total}
        onPageChange={handlePageChange}
        isPending={isPending}
        className="items-start sm:items-center"
      />
    </>
  );
}
