"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Input,
  Select,
  Button,
  Badge,
  Icon,
  MetricsCard,
  ResponsiveTable,
  Dropdown,
  type DropdownItem,
} from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import {
  type WebhookEndpoint,
  type DeliveryStats,
  WEBHOOK_EVENT_TYPES,
  formatRelativeTime,
} from "@/lib/mock-data/webhooks";

interface WebhooksClientProps {
  initialWebhooks: WebhookEndpoint[];
  deliveryStats: DeliveryStats;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  initialFilters: {
    search: string;
    status: string;
    eventType: string;
  };
}

export function WebhooksClient({
  initialWebhooks,
  deliveryStats,
  pagination,
  initialFilters,
}: WebhooksClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local state for filters
  const [search, setSearch] = useState(initialFilters.search);
  const [status, setStatus] = useState(initialFilters.status);
  const [eventType, setEventType] = useState(initialFilters.eventType);
  
  // Track if this is the initial mount to prevent initial effect trigger
  const isInitialMount = useRef(true);

  const updateFilters = useCallback((updates: Partial<typeof initialFilters>) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.search !== undefined) {
      if (updates.search) {
        params.set("search", updates.search);
      } else {
        params.delete("search");
      }
    }

    if (updates.status !== undefined) {
      if (updates.status !== "all") {
        params.set("status", updates.status);
      } else {
        params.delete("status");
      }
    }

    if (updates.eventType !== undefined) {
      if (updates.eventType !== "all") {
        params.set("eventType", updates.eventType);
      } else {
        params.delete("eventType");
      }
    }

    // Reset to page 1 when filters change
    params.set("page", "1");

    startTransition(() => {
      router.push(`/admin/webhooks?${params.toString()}`);
    });
  }, [router, searchParams]);

  // Debounced search - only update URL if search value differs from URL
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (search === initialFilters.search) return;
    
    const timer = setTimeout(() => {
      updateFilters({ search });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    updateFilters({ status: newStatus });
  };

  const handleEventTypeChange = (newEventType: string) => {
    setEventType(newEventType);
    updateFilters({ eventType: newEventType });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/admin/webhooks?${params.toString()}`);
    });
  };

  // Prepare chart data for MetricsCard
  const chartData = deliveryStats.dailyData.map((day) => ({
    label: day.day,
    value: day.successCount + day.failedCount,
    successRate: day.successRate,
  }));

  // Event type options for dropdown
  const eventTypeOptions = [
    { value: "all", label: "All Event Types" },
    ...WEBHOOK_EVENT_TYPES.map((event) => ({
      value: event.value,
      label: event.label,
    })),
  ];

  // Table columns configuration
  const columns = [
    {
      key: "displayName",
      header: "Name",
      className: "w-[180px]",
      render: (webhook: WebhookEndpoint) => (
        <Link
          href={`/admin/webhooks/${webhook.id}`}
          className="font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)] transition-colors line-clamp-1"
        >
          {webhook.displayName || (
            <span className="text-[var(--color-text-tertiary)]">Unnamed</span>
          )}
        </Link>
      ),
    },
    {
      key: "url",
      header: "URL",
      className: "max-w-[250px]",
      render: (webhook: WebhookEndpoint) => (
        <span className="text-sm text-[var(--color-text-secondary)] font-mono truncate block">
          {webhook.url}
        </span>
      ),
    },
    {
      key: "events",
      header: "Events",
      className: "w-[180px]",
      render: (webhook: WebhookEndpoint) => (
        <div className="flex flex-wrap gap-1">
          {webhook.events.slice(0, 2).map((event) => (
            <Badge key={event} variant="default" className="text-xs">
              {event}
            </Badge>
          ))}
          {webhook.events.length > 2 && (
            <Badge variant="default" className="text-xs">
              +{webhook.events.length - 2} more
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "isActive",
      header: "Status",
      className: "w-[100px]",
      render: (webhook: WebhookEndpoint) => (
        <Badge variant={webhook.isActive ? "success" : "default"} dot>
          {webhook.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "lastDelivery",
      header: "Last Delivery",
      className: "w-[140px]",
      render: (webhook: WebhookEndpoint) =>
        webhook.lastDelivery ? (
          <div className="flex items-center gap-2">
            <Icon
              name={webhook.lastDelivery.status === "success" ? "check_circle" : "cancel"}
              className={cn(
                "!text-lg flex-shrink-0",
                webhook.lastDelivery.status === "success" ? "text-green-500" : "text-red-500"
              )}
            />
            <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
              {formatRelativeTime(webhook.lastDelivery.timestamp)}
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--color-text-tertiary)]">N/A</span>
        ),
    },
    {
      key: "createdAt",
      header: "Created",
      className: "w-[110px]",
      render: (webhook: WebhookEndpoint) => (
        <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
          {webhook.createdAt.toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "w-[60px]",
      render: (webhook: WebhookEndpoint) => <WebhookActionsDropdown webhookId={webhook.id} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Card */}
      <MetricsCard
        title="Delivery Success Rate"
        value={`${deliveryStats.successRate}%`}
        trend={{
          value: deliveryStats.trend,
          label: "vs. previous 7 days",
        }}
        chartData={chartData}
      />

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Search */}
          <div className="flex-1 min-w-0">
            <Input
              leftIcon="search"
              placeholder="Search by name or URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Event Type Filter */}
          <div className="w-full sm:w-[200px]">
            <Select
              value={eventType}
              onChange={(value) => handleEventTypeChange(value)}
              options={eventTypeOptions}
              placeholder="Event Type"
            />
          </div>
        </div>

        {/* Status Toggle Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={status === "all" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleStatusChange("all")}
          >
            All
          </Button>
          <Button
            variant={status === "active" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleStatusChange("active")}
          >
            Active
          </Button>
          <Button
            variant={status === "inactive" ? "primary" : "secondary"}
            size="sm"
            onClick={() => handleStatusChange("inactive")}
          >
            Inactive
          </Button>
        </div>
      </div>

      {/* Loading overlay */}
      {isPending && (
        <div className="absolute inset-0 bg-[var(--color-background)]/50 z-10 flex items-center justify-center">
          <div className="animate-spin">
            <Icon name="refresh" className="text-[var(--color-primary)]" />
          </div>
        </div>
      )}

      {/* Webhooks Table */}
      <div className="overflow-hidden rounded-lg border-0 sm:border sm:border-[#344d65]">
        <ResponsiveTable<WebhookEndpoint>
          columns={columns}
          data={initialWebhooks}
          keyExtractor={(webhook) => webhook.id}
          mobileCardRender={(webhook: WebhookEndpoint) => (
            <Link href={`/admin/webhooks/${webhook.id}`}>
              <div className="rounded-lg p-4 space-y-3 border border-[#344d65] hover:border-[#1773cf] transition-colors sm:border-0" style={{ backgroundColor: '#1a2632' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {webhook.displayName || "Unnamed Webhook"}
                    </p>
                    <p className="text-xs text-gray-400 font-mono truncate mt-1">
                      {webhook.url}
                    </p>
                  </div>
                  <Badge 
                    variant={webhook.isActive ? "success" : "default"} 
                    dot
                    className="flex-shrink-0"
                  >
                    {webhook.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-400 uppercase mb-1">Events</p>
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.slice(0, 3).map((event: string) => (
                        <Badge key={event} variant="default" className="text-xs">
                          {event}
                        </Badge>
                      ))}
                      {webhook.events.length > 3 && (
                        <Badge variant="default" className="text-xs">
                          +{webhook.events.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#344d65]">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 uppercase">Last Delivery</p>
                      {webhook.lastDelivery ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Icon
                            name={webhook.lastDelivery.status === "success" ? "check_circle" : "cancel"}
                            className={cn(
                              "!text-base",
                              webhook.lastDelivery.status === "success"
                                ? "text-green-500"
                                : "text-red-500"
                            )}
                          />
                          <span className="text-sm text-[#93adc8]">
                            {formatRelativeTime(webhook.lastDelivery.timestamp)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mt-0.5">N/A</p>
                      )}
                    </div>
                    <Icon name="chevron_right" className="text-[#1773cf]" />
                  </div>
                </div>
              </div>
            </Link>
          )}
        />
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{" "}
            {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)} of{" "}
            {pagination.totalItems} webhooks
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPreviousPage || isPending}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNextPage || isPending}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Actions dropdown component
function WebhookActionsDropdown({ webhookId }: { webhookId: string }) {
  const router = useRouter();

  const menuItems: DropdownItem[] = [
    {
      label: "Edit",
      icon: "edit",
      onClick: () => router.push(`/admin/webhooks/${webhookId}`),
    },
    {
      label: "View Logs",
      icon: "receipt_long",
      onClick: () => router.push(`/admin/webhooks/${webhookId}#logs`),
    },
    {
      label: "Test Webhook",
      icon: "send",
      onClick: () => {
        // Mock action
        alert("Test webhook delivery initiated");
      },
    },
    {
      label: "Disable",
      icon: "toggle_off",
      onClick: () => {
        // Mock action
        alert("Webhook disabled");
      },
    },
    {
      label: "Delete",
      icon: "delete",
      danger: true,
      onClick: () => {
        if (confirm("Are you sure you want to delete this webhook?")) {
          alert("Webhook deleted");
        }
      },
    },
  ];

  return (
    <Dropdown
      trigger={
        <button
          className="p-2 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          aria-label="More actions"
        >
          <Icon name="more_vert" className="!text-xl" />
        </button>
      }
      items={menuItems}
      align="right"
    />
  );
}
