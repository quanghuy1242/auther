import { headers as nextHeaders } from "next/headers";

import { auth } from "@/lib/auth";
import {
  authorizationSpaceRepository,
  oauthClientSpaceLinkRepository,
  userRepository,
} from "@/lib/repositories";

type RequestHeaders = Awaited<ReturnType<typeof nextHeaders>>;

export interface AuthenticatedSpaceApiKey {
  apiKeyId: string;
  ownerUserId: string;
  clientId: string;
  authorizationSpaceId: string;
}

export interface SpaceApiKeyAuthError {
  status: 401 | 403 | 404;
  body: {
    error: string;
    message: string;
  };
}

export async function authenticateAuthorizationSpaceApiKey(
  requestHeaders: RequestHeaders,
  authorizationSpaceId: string
): Promise<{ data: AuthenticatedSpaceApiKey } | { error: SpaceApiKeyAuthError }> {
  const space = await authorizationSpaceRepository.findById(authorizationSpaceId);
  if (!space || !space.enabled) {
    return {
      error: {
        status: 404,
        body: {
          error: "space_not_found",
          message: "Authorization space was not found or is disabled",
        },
      },
    };
  }

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

  const link = await oauthClientSpaceLinkRepository.findByClientAndSpace(
    keyClientId,
    authorizationSpaceId
  );

  if (!link || link.accessMode !== "full") {
    return {
      error: {
        status: 403,
        body: {
          error: "forbidden",
          message: "API key client is not allowed to consume this authorization space",
        },
      },
    };
  }

  return {
    data: {
      apiKeyId: verification.key.id,
      ownerUserId,
      clientId: keyClientId,
      authorizationSpaceId,
    },
  };
}
