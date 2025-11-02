#!/usr/bin/env tsx
/**
 * Seed Admin User for Docker Test Environment
 * 
 * Creates a test admin user if it doesn't already exist.
 * This script is run automatically when Docker Compose starts.
 */

import { createClient } from "@libsql/client";

const TEST_ADMIN = {
  email: "admin@test.local",
  password: "admin123",
  name: "Test Admin",
  username: "testadmin",
  displayUsername: "testadmin",
};

async function seedAdminUser() {
  console.log("🌱 Starting admin user seed...");

  // Wait a bit for the app to be fully ready
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const client = createClient({
    url: process.env.BETTER_AUTH_DATABASE_URL || "http://libsql:8080",
  });

  try {
    // Check if admin user already exists
    const existing = await client.execute({
      sql: "SELECT id, email, role FROM user WHERE email = ?",
      args: [TEST_ADMIN.email],
    });

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      console.log(`✅ Admin user already exists: ${user.email} (role: ${user.role})`);
      
      // Ensure the user has admin role
      if (user.role !== "admin") {
        await client.execute({
          sql: "UPDATE user SET role = ? WHERE email = ?",
          args: ["admin", TEST_ADMIN.email],
        });
        console.log(`✅ Updated user role to admin`);
      }
      
      client.close();
      return;
    }

    console.log(`📝 Creating admin user: ${TEST_ADMIN.email}...`);

    // Create user via better-auth API
    const { auth } = await import("../src/lib/auth");

    try {
      const result = await auth.api.signUpEmail({
        body: {
          email: TEST_ADMIN.email,
          password: TEST_ADMIN.password,
          name: TEST_ADMIN.name,
          username: TEST_ADMIN.username,
          displayUsername: TEST_ADMIN.displayUsername,
        },
        headers: {
          "x-internal-signup-secret": process.env.PAYLOAD_CLIENT_SECRET || "",
        },
      });

      const user = "user" in result ? result.user : null;

      if (!user) {
        throw new Error("Unexpected response from Better Auth");
      }

      console.log(`✅ User created: ${user.id}`);

      // Set admin role
      await client.execute({
        sql: "UPDATE user SET role = ?, email_verified = ? WHERE id = ?",
        args: ["admin", 1, user.id],
      });

      console.log(`✅ Admin role and email verification set`);

      console.log("\n✨ Admin user created successfully:");
      console.log(`   Email: ${TEST_ADMIN.email}`);
      console.log(`   Password: ${TEST_ADMIN.password}`);
      console.log(`   Role: admin`);
      console.log(`   Email Verified: true`);
      console.log("");
    } catch (error) {
      console.error("❌ Failed to create user via better-auth:", error);
      throw error;
    }
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    client.close();
  }
}

// Run if executed directly
if (require.main === module) {
  seedAdminUser()
    .then(() => {
      console.log("✅ Seed completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Seed error:", error);
      process.exit(1);
    });
}

export { seedAdminUser };
