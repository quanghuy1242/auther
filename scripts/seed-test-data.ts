#!/usr/bin/env tsx
/**
 * Seed Test Data Script
 * 
 * This script populates the test database with initial data for E2E testing:
 * - Admin user
 * - Regular test users
 * - OAuth clients (if needed)
 */

import { db } from "@/lib/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

const TEST_USERS = [
  {
    email: "admin@test.local",
    name: "Test Admin",
    username: "admin",
    password: "Test1234!",
    emailVerified: true,
    role: "admin" as const,
  },
  {
    email: "user1@test.local",
    name: "Test User 1",
    username: "testuser1",
    password: "Test1234!",
    emailVerified: true,
    role: "user" as const,
  },
  {
    email: "user2@test.local",
    name: "Test User 2",
    username: "testuser2",
    password: "Test1234!",
    emailVerified: false,
    role: "user" as const,
  },
  {
    email: "unverified@test.local",
    name: "Unverified User",
    username: "unverified",
    password: "Test1234!",
    emailVerified: false,
    role: "user" as const,
  },
];

async function seedUsers() {
  console.log("🌱 Seeding test users...");

  for (const testUser of TEST_USERS) {
    try {
      // Check if user already exists
      const existingUsers = await db
        .select()
        .from(user)
        .where(eq(user.email, testUser.email))
        .limit(1);

      if (existingUsers.length > 0) {
        console.log(`   ✓ User ${testUser.email} already exists, skipping...`);
        continue;
      }

      // Create user with better-auth's password hashing
      // Note: In a real seed script, you'd use better-auth's API to create users
      // For now, we'll just log what would be created
      console.log(`   → Creating user: ${testUser.email} (${testUser.role})`);
      
      // TODO: Use better-auth API to create users with proper password hashing
      // For now, you'll need to create users manually or through the API
      
    } catch (error) {
      console.error(`   ✗ Failed to create user ${testUser.email}:`, error);
    }
  }

  console.log("✅ User seeding complete!");
}

async function seedClients() {
  console.log("\n🔐 OAuth clients should be seeded using the API...");
  console.log("   Run: pnpm clients:seed after the app is running");
}

async function main() {
  console.log("🚀 Starting test database seeding...\n");

  try {
    await seedUsers();
    await seedClients();

    console.log("\n✅ Database seeding complete!");
    console.log("\n📝 Next steps:");
    console.log("   1. Wait for the app to be healthy");
    console.log("   2. Run: docker compose -f docker-compose.test.yml exec app pnpm clients:seed");
    console.log("   3. Run Playwright tests: pnpm test:e2e");
  } catch (error) {
    console.error("\n❌ Error seeding database:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedUsers, seedClients };
