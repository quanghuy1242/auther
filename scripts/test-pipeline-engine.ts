import { pipelineRepository } from "../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- Starting Pipeline Engine Verification ---");

    // 1. Create a Test Script (Logic)
    console.log("1. Creating Test Script...");
    const scriptContent = `
    local helpers = helpers
    local context = context

    helpers.log("Hello from Lua! Context email: " .. (context.email or "nil"))
    
    if context.email == "blocked@example.com" then
        return { allowed = false, error = "You are blocked!" }
    end

    helpers.queueWebhook("user.signup", { email = context.email })

    return { allowed = true, data = { riskScore = 10, enriched = true } }
  `;

    const script = await pipelineRepository.createScript({
        name: "Verification Script",
        code: scriptContent,
    });
    console.log("Script Created:", script.id);

    // 2. Create Execution Plan (wiring it manually for now as if Graph did it)
    console.log("2. Updating Execution Plan...");
    await pipelineRepository.updateExecutionPlan("test_event", [[script.id]]);

    // 3. Execute Engine - Scenario A: Allowed
    console.log("3. Executing Trigger 'test_event' (Scenario: Allowed)...");
    const resultA = await pipelineEngine.executeTrigger("test_event", {
        email: "test@example.com",
    });
    console.log("Result A:", resultA);

    if (JSON.stringify(resultA) !== JSON.stringify({ allowed: true, data: { riskScore: 10, enriched: true } })) {
        throw new Error("Scenario A Failed!");
    }

    // 4. Execute Engine - Scenario B: Blocked
    console.log("4. Executing Trigger 'test_event' (Scenario: Blocked)...");
    const resultB = await pipelineEngine.executeTrigger("test_event", {
        email: "blocked@example.com",
    });
    console.log("Result B:", resultB);

    if (resultB.allowed !== false || resultB.error !== "You are blocked!") {
        throw new Error("Scenario B Failed!");
    }

    console.log("--- Verification Success! ---");
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
