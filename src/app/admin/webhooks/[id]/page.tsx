import { getWebhookById, getDeliveryHistory } from "../actions";
import { EditWebhookClient } from "./edit-webhook-client";
import { Card, CardContent, Button, Icon } from "@/components/ui";
import Link from "next/link";

export default async function EditWebhookPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  
  // Get webhook data
  const webhook = await getWebhookById(resolvedParams.id);
  
  const deliveryHistoryResult = await getDeliveryHistory(resolvedParams.id, { page: 1, pageSize: 25 });
  const deliveryHistory = deliveryHistoryResult?.deliveries || [];

  if (!webhook) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <Icon name="error" className="text-red-500 text-4xl mb-4" />
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
              Webhook Not Found
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-6">
              The webhook you&apos;re looking for doesn&apos;t exist or has been deleted.
            </p>
            <Link href="/admin/webhooks">
              <Button variant="primary" size="sm">Back to Webhooks</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <EditWebhookClient webhook={webhook} deliveryHistory={deliveryHistory} />;
}
