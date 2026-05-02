import { RegistrationTab } from "../registration-tabs";
import {
    getClientContexts,
    getClientRegistrationStatus,
    getClientRegistrationGrantTargets,
} from "../registration-actions";

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default async function ClientRegistrationPage({ params }: PageProps) {
    const { id } = await params;

    const [contexts, status, grantTargetsResult] = await Promise.all([
        getClientContexts(id),
        getClientRegistrationStatus(id),
        getClientRegistrationGrantTargets(id),
    ]);

    return (
        <RegistrationTab
            clientId={id}
            contexts={contexts}
            allowsContexts={status.allowsContexts}
            grantTargets={grantTargetsResult.targets}
        />
    );
}
