import { RegistrationTab } from "../registration-tabs";
import {
    getClientContexts,
    getClientRegistrationStatus,
    getClientRelations,
} from "../registration-actions";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function ClientRegistrationPage({ params }: PageProps) {
    const { id } = await params;

    const [contexts, status, relationsResult] = await Promise.all([
        getClientContexts(id),
        getClientRegistrationStatus(id),
        getClientRelations(id),
    ]);

    return (
        <RegistrationTab
            clientId={id}
            contexts={contexts}
            allowsContexts={status.allowsContexts}
            entityTypes={relationsResult.entityTypes}
        />
    );
}
