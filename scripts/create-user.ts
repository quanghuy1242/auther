import { loadEnvironment, validateArgs, exitWithError, logSuccess } from "./utils";

loadEnvironment();

async function main() {
  const [email, password, name, username, displayUsername] = validateArgs(
    [
      process.argv[2],
      process.argv[3],
      process.argv[4],
      process.argv[5],
      process.argv[6],
    ],
    "Usage: pnpm user:create <email> <password> <name> <username> <displayUsername>"
  );

  const { auth } = await import("../src/lib/auth");

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        username,
        displayUsername,
      },
      headers: {
        "x-internal-signup-secret": process.env.PAYLOAD_CLIENT_SECRET || "",
      },
    });

    const user = "user" in result ? result.user : null;
    
    if (!user) {
      console.error("Unexpected response from Better Auth:", result);
      process.exit(1);
    }

    logSuccess("User created", {
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    exitWithError("Failed to create user", error);
  }
}

main();

