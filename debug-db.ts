
import { db } from "./src/lib/db";
import { oauthClientMetadata } from "./src/db/schema";

async function main() {
    try {
        const res = await db.select().from(oauthClientMetadata);
        console.log("Current oauth_client_metadata records:");
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e);
    }
}

main();
