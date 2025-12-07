import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
    console.log("Dropping pipeline_execution_plan table...");
    try {
        await db.run(sql`DROP TABLE IF EXISTS pipeline_execution_plan`);
        console.log("Dropped.");
    } catch (e) {
        console.error("Error dropping table:", e);
    }
}

main().then(() => process.exit(0));
