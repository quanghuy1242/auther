"use client";

import { useClient } from "../client-context";
import { RequestsTab } from "../registration-tabs";
import { getClientRequests } from "../registration-actions";
import * as React from "react";

export default function ClientRequestsPage() {
    const client = useClient();
    const [requests, setRequests] = React.useState<Awaited<ReturnType<typeof getClientRequests>>>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function load() {
            try {
                const reqs = await getClientRequests(client.clientId);
                setRequests(reqs);
            } catch (error) {
                console.error("Failed to load requests:", error);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [client.clientId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-neutral-500">Loading...</div>
            </div>
        );
    }

    return (
        <RequestsTab
            clientId={client.clientId}
            requests={requests}
        />
    );
}
