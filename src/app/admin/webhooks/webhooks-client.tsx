"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  Button,
  Badge,
  Icon,
  MetricsCard,
  ResponsiveTable,
  Dropdown,
  Modal,
  SearchInput,
  Pagination,
  type DropdownItem,
} from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/time";
import Link from "next/link";
import { toast } from "@/lib/toast";
import {
  type WebhookEndpointWithSubscriptions,
  type WebhookDeliveryStats,
  toggleWebhookStatus,
  deleteWebhook,
  testWebhook,
} from "./actions";
import { WEBHOOK_EVENT_TYPES } from "@/lib/constants";

interface WebhooksClientProps {
  initialWebhooks: WebhookEndpointWithSubscriptions[];
  deliveryStats: WebhookDeliveryStats;
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
  const [status, setStatus] = useState(initialFilters.status);
  const [eventType, setEventType] = useState(initialFilters.eventType);

  const handleActionComplete = useCallback(() => {
    router.refresh();
  }, [router]);

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
      render: (webhook: WebhookEndpointWithSubscriptions) => (
        <Link
          href={`/admin/webhooks/${webhook.id}`}
          className="font-medium text-blue-400 hover:underline"
        >
          {webhook.displayName || (
            <span className="text-gray-400">Unnamed</span>
          )}
        </Link>
      ),
    },
    {
      key: "url",
      header: "URL",
      className: "max-w-[250px]",
      render: (webhook: WebhookEndpointWithSubscriptions) => (
        <span className="text-sm text-[var(--color-text-secondary)] font-mono truncate block">
          {webhook.url}
        </span>
      ),
    },
    {
      key: "events",
      header: "Events",
      className: "w-[180px]",
      render: (webhook: WebhookEndpointWithSubscriptions) => {
        const eventTypes = webhook.subscriptions.map(s => s.eventType);
        return (
          <div className="flex flex-wrap gap-1">
            {eventTypes.slice(0, 2).map((event) => (
              <Badge key={event} variant="default" className="text-xs">
                {event}
              </Badge>
            ))}
            {eventTypes.length > 2 && (
              <Badge variant="default" className="text-xs">
                +{eventTypes.length - 2} more
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "isActive",
      header: "Status",
      className: "w-[120px]",
      render: (webhook: WebhookEndpointWithSubscriptions) => {
        // Webhooks without URL are in "Pending Setup" state
        if (!webhook.url || webhook.url.trim() === "") {
          return (
            <Badge variant="warning" dot>
              Pending Setup
            </Badge>
          );
        }
        return (
          <Badge variant={webhook.isActive ? "success" : "default"} dot>
            {webhook.isActive ? "Active" : "Inactive"}
          </Badge>
        );
      },
    },
    {
      key: "lastDelivery",
      header: "Last Delivery",
      className: "w-[140px]",
      render: (webhook: WebhookEndpointWithSubscriptions) =>
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
      render: (webhook: WebhookEndpointWithSubscriptions) => (
        <span className="text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
          {webhook.createdAt.toLocaleDateString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "w-[60px]",
      render: (webhook: WebhookEndpointWithSubscriptions) => (
        <WebhookActionsDropdown
          webhookId={webhook.id}
          isActive={webhook.isActive}
          onActionComplete={handleActionComplete}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 relative">

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
            <SearchInput
              placeholder="Search by name or URL..."
              defaultValue={initialFilters.search}
              onSearch={(value) => updateFilters({ search: value })}
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

      {/* Webhooks Table */}
      <div className="rounded-lg border-0 sm:border sm:border-border-dark">
        <ResponsiveTable<WebhookEndpointWithSubscriptions>
          columns={columns}
          data={initialWebhooks}
          keyExtractor={(webhook) => webhook.id}
          mobileCardRender={(webhook: WebhookEndpointWithSubscriptions) => (
            <Link href={`/admin/webhooks/${webhook.id}`}>
              <div className="rounded-lg p-4 space-y-3 border border-border-dark hover:border-primary transition-colors sm:border-0 bg-card">
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
                      {webhook.subscriptions.slice(0, 3).map((sub) => (
                        <Badge key={sub.id} variant="default" className="text-xs">
                          {sub.eventType}
                        </Badge>
                      ))}
                      {webhook.subscriptions.length > 3 && (
                        <Badge variant="default" className="text-xs">
                          +{webhook.subscriptions.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border-dark">
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
                          <span className="text-sm text-[var(--color-text-secondary)]">
                            {formatRelativeTime(webhook.lastDelivery.timestamp)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 mt-0.5">N/A</p>
                      )}
                    </div>
                    <Icon name="chevron_right" className="text-primary" />
                  </div>
                </div>
              </div>
            </Link>
          )}
        />
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          onPageChange={handlePageChange}
          isPending={isPending}
        />
      )}
    </div>
  );
}

// Actions dropdown component
function WebhookActionsDropdown({
  webhookId,
  isActive,
  onActionComplete
}: {
  webhookId: string;
  isActive: boolean;
  onActionComplete: () => void;
}) {
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleTestWebhook = async () => {
    setIsProcessing(true);
    try {
      const result = await testWebhook(webhookId);

      if (result.success) {
        toast.success(
          "Test queued",
          result.message || "Test event triggered successfully."
        );
        setTimeout(() => {
          onActionComplete();
        }, 1200);
      } else {
        toast.error(
          "Test failed",
          result.error || "Failed to trigger test event."
        );
      }
    } catch (error) {
      toast.error(
        "Test failed",
        error instanceof Error ? error.message : "Unexpected error occurred."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleStatus = async () => {
    setShowDisableModal(false);
    setIsProcessing(true);

    try {
      const result = await toggleWebhookStatus(webhookId, !isActive);

      if (result.success) {
        const message = isActive ? "Webhook disabled" : "Webhook enabled";
        const description = isActive
          ? "The webhook will no longer receive events"
          : "The webhook is now active and will receive events";
        toast.success(message, description);
        onActionComplete();
      } else {
        toast.error("Failed to update webhook", result.error);
      }
    } catch (error) {
      toast.error(
        "Failed to update webhook",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setShowDeleteModal(false);
    setIsProcessing(true);

    try {
      const result = await deleteWebhook(webhookId);

      if (result.success) {
        toast.success(
          "Webhook deleted",
          "The webhook endpoint has been permanently deleted."
        );
        onActionComplete();
      } else {
        toast.error("Failed to delete webhook", result.error);
      }
    } catch (error) {
      toast.error(
        "Failed to delete webhook",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const menuItems: DropdownItem[] = [
    {
      label: "Edit",
      icon: "edit",
      onClick: () => router.push(`/admin/webhooks/${webhookId}`),
      disabled: isProcessing,
    },
    {
      label: "View Logs",
      icon: "receipt_long",
      onClick: () => router.push(`/admin/webhooks/${webhookId}#logs`),
      disabled: isProcessing,
    },
    {
      label: "Test Webhook",
      icon: "send",
      onClick: handleTestWebhook,
      disabled: isProcessing,
    },
    {
      label: isActive ? "Disable" : "Enable",
      icon: isActive ? "toggle_off" : "toggle_on",
      onClick: () => setShowDisableModal(true),
      disabled: isProcessing,
    },
    {
      label: "Delete",
      icon: "delete",
      danger: true,
      onClick: () => setShowDeleteModal(true),
      disabled: isProcessing,
    },
  ];

  return (
    <>
      <Dropdown
        trigger={
          <button
            className="p-2 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50"
            aria-label="More actions"
            disabled={isProcessing}
          >
            <Icon name="more_vert" className="!text-xl" />
          </button>
        }
        items={menuItems}
        align="end"
      />

      {/* Disable/Enable Confirmation Modal */}
      <Modal
        isOpen={showDisableModal}
        onClose={() => setShowDisableModal(false)}
        title={isActive ? "Disable Webhook?" : "Enable Webhook?"}
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {isActive
              ? "This webhook will stop receiving events. You can re-enable it at any time."
              : "This webhook will start receiving events again immediately."}
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDisableModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant={isActive ? "secondary" : "primary"}
              size="sm"
              onClick={handleToggleStatus}
            >
              {isActive ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Webhook?"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This action cannot be undone. All delivery history for this webhook will be permanently deleted.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
            >
              Delete Webhook
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
