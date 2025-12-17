"use client";

import { useClient } from "../client-context";
import { RegistrationTab } from "../registration-tabs";
import {
    getClientContexts,
    getClientRegistrationStatus,
} from "../registration-actions";
import * as React from "react";

export default function ClientRegistrationPage() {
    const client = useClient();
    const [contexts, setContexts] = React.useState<Awaited<ReturnType<typeof getClientContexts>>>([]);
    const [status, setStatus] = React.useState<Awaited<ReturnType<typeof getClientRegistrationStatus>> | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        async function load() {
            try {
                const [ctxs, stat] = await Promise.all([
                    getClientContexts(client.clientId),
                    getClientRegistrationStatus(client.clientId),
                ]);
                setContexts(ctxs);
                setStatus(stat);
            } catch (error) {
                console.error("Failed to load registration data:", error);
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
        <RegistrationTab
            clientId={client.clientId}
            contexts={contexts}
            allowsContexts={status?.allowsContexts ?? false}
        />
    );
}
