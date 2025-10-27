import { 
  loadEnvironment, 
  validateEnvVars, 
  parseCommaSeparated, 
  exitWithError 
} from "./utils";

loadEnvironment();

type RegistrationInput = {
  label: string;
  envIdKey: string;
  envSecretKey?: string;
  request: {
    client_name: string;
    redirect_uris: string[];
    token_endpoint_auth_method: "none" | "client_secret_basic" | "client_secret_post";
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
    metadata?: Record<string, unknown>;
  };
};

async function registerClient(
  seed: RegistrationInput,
  guardSecret: string
): Promise<void> {
  const { auth } = await import("../src/lib/auth");

  const result = await auth.api.registerOAuthApplication({
    body: {
      // @ts-expect-error: Additional properties allowed
      grant_types: ["authorization_code"],
      // @ts-expect-error: Additional properties allowed
      response_types: ["code"],
      ...seed.request,
    },
    headers: {
      "x-internal-signup-secret": guardSecret,
    },
  });

  console.log(result);

  if (!("client_id" in result)) {
    throw new Error(`Unexpected response when registering ${seed.label}`);
  }

  const clientSecret =
    "client_secret" in result ? (result.client_secret as string | null) : null;

  console.log(`\n${seed.label}`);
  console.log("  client_id:     ", result.client_id);
  
  if (seed.envSecretKey) {
    console.log("  client_secret: ", clientSecret ?? "(none returned)");
    console.log(`  ➜ Update env: ${seed.envIdKey}=${result.client_id}`);
    console.log(`                 ${seed.envSecretKey}=${clientSecret ?? ""}`);
  } else {
    console.log("  (public client – no secret required)");
    console.log(`  ➜ Update env: ${seed.envIdKey}=${result.client_id}`);
  }
}

async function main() {
  try {
    validateEnvVars({
      PAYLOAD_CLIENT_SECRET: process.env.PAYLOAD_CLIENT_SECRET,
      PAYLOAD_REDIRECT_URI: process.env.PAYLOAD_REDIRECT_URI,
      PAYLOAD_SPA_REDIRECT_URIS: process.env.PAYLOAD_SPA_REDIRECT_URIS,
    });
  } catch (error) {
    exitWithError("Environment validation failed", error);
  }

  const guardSecret = process.env.PAYLOAD_CLIENT_SECRET!;
  const adminRedirect = process.env.PAYLOAD_REDIRECT_URI!;
  const spaRedirects = parseCommaSeparated(process.env.PAYLOAD_SPA_REDIRECT_URIS);

  if (!spaRedirects.length) {
    exitWithError(
      "Configuration error",
      "PAYLOAD_SPA_REDIRECT_URIS must include at least one redirect URI"
    );
  }

  const seeds: RegistrationInput[] = [
    {
      label: "Payload Admin (confidential client)",
      envIdKey: "PAYLOAD_CLIENT_ID",
      envSecretKey: "PAYLOAD_CLIENT_SECRET",
      request: {
        client_name: "Payload Admin",
        redirect_uris: [adminRedirect],
        token_endpoint_auth_method: "client_secret_basic",
        metadata: {
          tokenEndpointAuthMethod: "client_secret_basic",
          grantTypes: ["authorization_code"],
        },
      },
    },
    {
      label: "Payload SPA (PKCE public client)",
      envIdKey: "PAYLOAD_SPA_CLIENT_ID",
      request: {
        client_name: "Payload SPA",
        redirect_uris: spaRedirects,
        token_endpoint_auth_method: "none",
        metadata: {
          tokenEndpointAuthMethod: "none",
          grantTypes: ["authorization_code"],
          postLogoutRedirectUris: parseCommaSeparated(
            process.env.PAYLOAD_SPA_LOGOUT_URIS
          ),
        },
      },
    },
  ];

  for (const seed of seeds) {
    try {
      await registerClient(seed, guardSecret);
    } catch (error) {
      exitWithError(`Failed to register ${seed.label}`, error);
    }
  }

  console.log(
    "\n✅ Client registration complete. Paste the printed values into your .env files and redeploy."
  );
}

main().catch((error) => {
  exitWithError("Unexpected error during client registration", error);
});

