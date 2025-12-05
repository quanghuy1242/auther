import { AccessControl } from "@/components/admin/access-control/access-control";
import {
  getCurrentUserAccessLevel,
  getClientMetadata,
  getPlatformAccessList,
  getAuthorizationModels,
  getScopedPermissions,
  getClientApiKeys,
} from "./actions";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AccessControlPage({ params }: PageProps) {
  const { id } = await params;

  // Parallel fetch for core data
  const [accessLevel, metadata, accessList, modelsResult, scopedPerms] = await Promise.all([
    getCurrentUserAccessLevel(id),
    getClientMetadata(id),
    getPlatformAccessList(id),
    getAuthorizationModels(id),
    getScopedPermissions(id),
  ]);

  // Conditional fetch for API keys
  let apiKeys: any[] = [];
  if (metadata.allowsApiKeys) {
    apiKeys = await getClientApiKeys(id);
  }

  const initialData = {
    accessLevel,
    metadata,
    accessList,
    models: modelsResult,
    scopedPerms,
    apiKeys,
  };

  return <AccessControl initialData={initialData} />;
}