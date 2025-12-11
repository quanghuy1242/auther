import { getSecrets } from "../actions";
import { SecretsManager } from "@/components/admin/pipelines/secrets-manager";

/**
 * Secrets Management page.
 * Provides UI for managing encrypted pipeline secrets.
 */
export default async function SecretsPage() {
    // Fetch only secrets data (lazy loaded)
    const secrets = await getSecrets();

    return <SecretsManager initialSecrets={secrets} />;
}
