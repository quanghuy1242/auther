
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

// --- MOCK APPLICATION FUNCTION ---
async function handleApiRequest() {
  console.log(`\n[TS APP] 1. Received API Request`);
  const start = Date.now();

  // --- PIPELINE HOOK POINT ---
  // We await execution, but the Pipeline Engine itself does NOT wait 
  // for async side-effects (like webhooks) if they are queued properly.
  console.log(`[TS APP] 2. Triggering 'post_activity' hook...`);

  // Note: If using await, we are waiting for the LUA SCRIPT to finish.
  // We are NOT waiting for the external HTTP call if using 'queueWebhook'.
  // If we used 'await(fetch)', we WOULD wait. 
  // This demo proves the 'queueWebhook' pattern is non-blocking to the main flow.
  await pipelineEngine.executeTrigger("post_activity", { user: "dave" });

  const duration = Date.now() - start;
  console.log(`[TS APP] 3. Sending HTTP Response to User`);
  console.log(`[TS APP]    Total Processing Time: ${duration}ms`);

  return duration;
}

async function main() {
  console.log("--- DEMO 04: Async (App Responsiveness) ---");

  // Script that does a "slow" thing in background
  const slowWebhookScript = await pipelineRepository.createScript({
    name: "Slow Webhook",
    code: `
      helpers.log("Script starting...")
      
      -- This helper is designed to vary off-thread or be fire-and-forget
      helpers.queueWebhook("analytics", { event = "click" })
      
      helpers.log("Script finished (took ~0ms CPU time)")
      return { allowed = true }
    `,
  });
  await pipelineRepository.updateExecutionPlan("post_activity", [[slowWebhookScript.id]]);

  const duration = await handleApiRequest();

  if (duration < 100) {
    console.log("\nPASS: App responded instantly (<100ms), ignoring background job.");
  } else {
    console.log("\nWARN: App was slow? Duration: " + duration);
  }

  process.exit(0);
}

main().catch(console.error);
