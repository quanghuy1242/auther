import { PageHeading } from "@/components/layout";
import { Button } from "@/components/ui";
import Link from "next/link";
import { WebhooksClient } from "./webhooks-client";
import {
  MOCK_WEBHOOKS,
  MOCK_DELIVERY_STATS,
  filterWebhooks,
} from "@/lib/mock-data/webhooks";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: "all" | "active" | "inactive";
    eventType?: string;
  }>;
}

export default async function WebhooksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const search = params.search || "";
  const status = params.status || "all";
  const eventType = params.eventType || "all";

  // Filter webhooks based on search params
  const filteredWebhooks = filterWebhooks(MOCK_WEBHOOKS, {
    search,
    status: status as "all" | "active" | "inactive",
    eventType: eventType === "all" ? undefined : eventType,
  });

  // Pagination
  const pageSize = 10;
  const totalItems = filteredWebhooks.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedWebhooks = filteredWebhooks.slice(startIndex, endIndex);

  const paginationInfo = {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <PageHeading
        title="Webhooks"
        description="Manage webhook endpoints and monitor delivery performance"
        action={
          <Link href="/admin/webhooks/create">
            <Button variant="primary" leftIcon="add">
              Add Webhook
            </Button>
          </Link>
        }
      />

      <WebhooksClient
        initialWebhooks={paginatedWebhooks}
        deliveryStats={MOCK_DELIVERY_STATS}
        pagination={paginationInfo}
        initialFilters={{
          search,
          status,
          eventType,
        }}
      />
    </div>
  );
}
