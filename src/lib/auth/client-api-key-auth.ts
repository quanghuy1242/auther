import { headers as nextHeaders } from "next/headers";

import { auth } from "@/lib/auth";
import { UserRepository } from "@/lib/repositories/user-repository";

type RequestHeaders = Awaited<ReturnType<typeof nextHeaders>>;

export interface AuthenticatedClientApiKey {
  apiKeyId: string;
  ownerUserId: string;
  clientId: string;
}

export interface ClientApiKeyAuthError {
  status: 401 | 403;
  body: {
    error: string;
    message: string;
  };
}

const userRepository = new UserRepository();

/**
 * Validates x-api-key and ensures it belongs to the expected OAuth client.
 */
export async function authenticateClientApiKey(
  requestHeaders: RequestHeaders,
  expectedClientId: string
): Promise<{ data: AuthenticatedClientApiKey } | { error: ClientApiKeyAuthError }> {
  const headerApiKey = requestHeaders.get("x-api-key");
  if (!headerApiKey) {
    return {
      error: {
        status: 401,
        body: {
          error: "unauthorized",
          message: "Missing x-api-key header",
        },
      },
    };
  }

  const verification = await auth.api.verifyApiKey({
    body: { key: headerApiKey },
    headers: requestHeaders,
  });

  if (!verification || !verification.valid || !verification.key) {
    return {
      error: {
        status: 401,
        body: {
          error: "invalid_api_key",
          message: "The provided API key is invalid or expired",
        },
      },
    };
  }

  const ownerUserId = verification.key.userId;
  if (!ownerUserId) {
    return {
      error: {
        status: 403,
        body: {
          error: "forbidden",
          message: "API key is not associated with an owning user",
        },
      },
    };
  }

  const owner = await userRepository.findById(ownerUserId);
  if (!owner) {
    return {
      error: {
        status: 403,
        body: {
          error: "forbidden",
          message: "API key owner was not found",
        },
      },
    };
  }

  const keyClientId =
    typeof verification.key.metadata?.oauth_client_id === "string"
      ? verification.key.metadata.oauth_client_id
      : null;

  if (!keyClientId) {
    return {
      error: {
        status: 403,
        body: {
          error: "forbidden",
          message: "API key is missing client scope metadata",
        },
      },
    };
  }

  if (keyClientId !== expectedClientId) {
    return {
      error: {
        status: 403,
        body: {
          error: "forbidden",
          message: "API key cannot access grants outside its client scope",
        },
      },
    };
  }

  return {
    data: {
      apiKeyId: verification.key.id,
      ownerUserId,
      clientId: keyClientId,
    },
  };
}
