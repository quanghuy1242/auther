import { PageHeading } from "@/components/layout";
import { Button } from "@/components/ui";
import Link from "next/link";
import { WebhooksClient } from "./webhooks-client";
import { getWebhooks, getDeliveryStats } from "./actions";

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
  const pageSize = 10;
  const search = params.search || "";
  const status = params.status || "all";
  const eventType = params.eventType || "all";

  // Fetch webhooks from server
  const webhooksResult = await getWebhooks({
    page,
    pageSize,
    search,
    status: status as "all" | "active" | "inactive",
    eventType: eventType === "all" ? undefined : eventType,
  });

  // Fetch delivery stats
  const deliveryStats = await getDeliveryStats();

  const paginationInfo = {
    page: webhooksResult.page,
    pageSize: webhooksResult.pageSize,
    totalItems: webhooksResult.total,
    totalPages: webhooksResult.totalPages,
    hasNextPage: webhooksResult.page < webhooksResult.totalPages,
    hasPreviousPage: webhooksResult.page > 1,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <PageHeading
        title="Webhooks"
        description="Manage webhook endpoints and monitor delivery performance"
        action={
          <Link href="/admin/webhooks/create">
            <Button variant="primary" size="sm" leftIcon="add">
              Add Webhook
            </Button>
          </Link>
        }
      />

      <WebhooksClient
        initialWebhooks={webhooksResult.webhooks}
        deliveryStats={deliveryStats}
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
