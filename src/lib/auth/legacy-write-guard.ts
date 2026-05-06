type LegacyWriteCategory =
  | "client_prefixed_model"
  | "oauth_client_platform_access"
  | "nullable_client_registration_context"
  | "nullable_client_permission_request"
  | "nullable_client_permission_rule"
  | "grant_projection_client_ids";

interface LegacyWriteDetails {
  category: LegacyWriteCategory;
  operation: string;
  route?: string;
  payload?: Record<string, unknown>;
}

function legacyWriteMode(): "block" | "audit" | "allow" {
  const value = process.env.AUTH_ACCESS_LEGACY_WRITE_MODE;
  if (value === "allow" || value === "audit" || value === "block") {
    return value;
  }
  return "block";
}

export function isLegacyWriteBlocked(): boolean {
  return legacyWriteMode() === "block";
}

export function assertLegacyWriteAllowed(details: LegacyWriteDetails): void {
  const mode = legacyWriteMode();
  const message = [
    "Legacy auth access write blocked",
    `category=${details.category}`,
    `operation=${details.operation}`,
    details.route ? `route=${details.route}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (mode === "allow") {
    return;
  }

  console.warn(message, details.payload ?? {});

  if (mode === "block") {
    throw new Error(
      `${message}. Set AUTH_ACCESS_LEGACY_WRITE_MODE=audit or allow only for migration/debug windows.`
    );
  }
}

export function assertNoOAuthClientPlatformAccessWrite(params: {
  entityType: string;
  relation: string;
  operation: string;
  payload?: Record<string, unknown>;
}): void {
  if (
    params.entityType === "oauth_client" &&
    (params.relation === "owner" || params.relation === "admin" || params.relation === "use")
  ) {
    assertLegacyWriteAllowed({
      category: "oauth_client_platform_access",
      operation: params.operation,
      payload: params.payload,
    });
  }
}

export function assertNoClientPrefixedModelWrite(params: {
  entityType: string;
  operation: string;
  payload?: Record<string, unknown>;
}): void {
  if (/^client_[^:]+(?::|$)/.test(params.entityType)) {
    assertLegacyWriteAllowed({
      category: "client_prefixed_model",
      operation: params.operation,
      payload: params.payload,
    });
  }
}
