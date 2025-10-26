import { config as loadEnv } from "dotenv";
import crypto from "node:crypto";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env", override: false });

type CookieJar = Record<string, string>;

const cookieJar: CookieJar = {};

function storeCookies(response: Response) {
  const headersAny = response.headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };
  const raw = headersAny.raw?.();
  const cookies =
    headersAny.getSetCookie?.() ??
    raw?.["set-cookie"] ??
    [];

  for (const cookie of cookies) {
    const [pair] = cookie.split(";");
    const [key, value] = pair.split("=");
    if (key && value !== undefined) {
      cookieJar[key.trim()] = value;
    }
  }
}

function getCookieHeader() {
  return Object.entries(cookieJar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

async function main() {
  const baseUrl =
    process.env.AUTH_BASE_URL ??
    process.env.PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const email = process.env.TEST_USER_EMAIL ?? "auth-flow@example.com";
  const password = process.env.TEST_USER_PASSWORD ?? "Passw0rd!";
  const name = process.env.TEST_USER_NAME ?? "Auth Flow User";
  const username = process.env.TEST_USER_USERNAME ?? "authflow";
  const displayUsername =
    process.env.TEST_USER_DISPLAY_USERNAME ?? "Auth Flow";

  const clientId = process.env.PAYLOAD_CLIENT_ID;
  const clientSecret = process.env.PAYLOAD_CLIENT_SECRET;
  const redirectUri =
    process.env.PAYLOAD_REDIRECT_URI ?? "http://localhost:3001/oauth/callback";

  if (!clientId || !clientSecret) {
    console.error("PAYLOAD_CLIENT_ID and PAYLOAD_CLIENT_SECRET must be set.");
    process.exit(1);
  }

  console.log(`Running Better Auth flow against ${baseUrl} with user ${email}`);

  // Step 0: ensure sign-in page reachable
  console.log("0) Checking /sign-in page…");
  const signInPageResponse = await fetch(`${baseUrl}/sign-in`, {
    redirect: "manual",
  });
  if (!signInPageResponse.ok && signInPageResponse.status !== 302) {
    const body = await signInPageResponse.text();
    console.error(
      `Failed to load sign-in page (${signInPageResponse.status}): ${body}`,
    );
    process.exit(1);
  }
  console.log("   • Sign-in page reachable.");

  // Step 1: sign in to obtain session cookie
  console.log("1) Signing in with email/password…");
  const signInResponse = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      rememberMe: true,
    }),
  });

  if (!signInResponse.ok) {
    const body = await signInResponse.text();
    console.error(
      `Failed to sign in (${signInResponse.status}): ${body}`,
    );
    process.exit(1);
  }
  storeCookies(signInResponse);
  console.log("   • Received session cookie.");

  // Step 2: initiate OIDC authorize flow
  console.log("2) Requesting authorization code…");
  const state = crypto.randomUUID();
  const authorizeUrl = new URL(`${baseUrl}/api/auth/oauth2/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set("state", state);

  const authorizeResponse = await fetch(authorizeUrl, {
    method: "GET",
    headers: {
      cookie: getCookieHeader(),
    },
    redirect: "manual",
  });

  storeCookies(authorizeResponse);

  let redirectLocation =
    authorizeResponse.headers.get("location") ?? undefined;

  if (!redirectLocation && authorizeResponse.ok) {
    try {
      const clone = authorizeResponse.clone();
      const contentType = clone.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await clone.json();
        redirectLocation =
          data.redirectURI ??
          data.redirectUri ??
          data.redirect_url ??
          data.url ??
          data.redirect ??
          undefined;
        if (typeof redirectLocation !== "string") {
          redirectLocation = undefined;
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }

  if (!redirectLocation) {
    const body = await authorizeResponse.text();
    console.error(
      `Failed to obtain authorization redirect (${authorizeResponse.status}): ${body}`,
    );
    process.exit(1);
  }

  const redirectUrl = new URL(redirectLocation);
  const code = redirectUrl.searchParams.get("code");
  const returnedState = redirectUrl.searchParams.get("state");

  if (!code) {
    console.error("Authorization redirect missing code.");
    process.exit(1);
  }

  if (state !== returnedState) {
    console.warn(
      "   • Warning: returned state does not match the request state.",
    );
  }

  console.log("   • Received authorization code.");

  // Step 4: exchange code for tokens
  console.log("3) Exchanging code for tokens…");
  const tokenResponse = await fetch(`${baseUrl}/api/auth/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    console.error(
      `Failed to exchange token (${tokenResponse.status}): ${body}`,
    );
    process.exit(1);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    token_type: string;
    expires_in: number;
  };

  if (!tokenData.access_token) {
    console.error("Token response missing access token:", tokenData);
    process.exit(1);
  }

  console.log("   • Access token received.");

  // Step 5: call userinfo endpoint
  console.log("4) Fetching user info…");
  const userInfoResponse = await fetch(`${baseUrl}/api/auth/oauth2/userinfo`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    const body = await userInfoResponse.text();
    console.error(
      `Failed to fetch userinfo (${userInfoResponse.status}): ${body}`,
    );
    process.exit(1);
  }

  const userInfo = await userInfoResponse.json();
  console.log("   • User info:", userInfo);

  // Step 6: retrieve JWKS
  console.log("5) Retrieving JWKS…");
  const jwksResponse = await fetch(`${baseUrl}/api/auth/jwks`);
  if (!jwksResponse.ok) {
    const body = await jwksResponse.text();
    console.error(
      `Failed to fetch JWKS (${jwksResponse.status}): ${body}`,
    );
    process.exit(1);
  }

  const jwks = await jwksResponse.json();
  const keyCount = Array.isArray(jwks.keys) ? jwks.keys.length : 0;
  console.log(`   • JWKS contains ${keyCount} key(s).`);

  console.log("\n✅ Better Auth flow verified successfully.");
}

main().catch((error) => {
  console.error("Unexpected error during auth test:", error);
  process.exit(1);
});
