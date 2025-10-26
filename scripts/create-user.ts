import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env", override: false });

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4];
  const username = process.argv[5];
  const displayUsername = process.argv[6];

  if (!email || !password || !name || !username || !displayUsername) {
    console.error("Usage: pnpm user:create <email> <password> <name> <username> <displayUsername>");
    process.exit(1);
  }

  const { auth } = await import("../src/lib/auth");

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
        username,
        displayUsername
      },
      headers: {
        
      }
    });

    const user = "user" in result ? result.user : null;
    if (!user) {
      console.error("Unexpected response from Better Auth:", result);
      process.exit(1);
    }

    console.log("✔ User created");
    console.log(`  id: ${user.id}`);
    console.log(`  email: ${user.email}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error creating user";
    console.error(`Failed to create user: ${message}`);
    process.exit(1);
  }
}

main();

