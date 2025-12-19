import { RequestsTab } from "../registration-tabs";
import { getClientRequests } from "../registration-actions";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function ClientRequestsPage({ params }: PageProps) {
    const { id } = await params;

    const requests = await getClientRequests(id);

    return (
        <RequestsTab
            clientId={id}
            requests={requests}
        />
    );
}
