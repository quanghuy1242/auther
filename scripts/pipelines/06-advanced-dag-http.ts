import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
  console.log("--- TEST: Advanced DAG & Safe HTTP ---");

  // 1. Create Nodes for DAG
  // Node A (Parallel 1): Fetches Mock Stripe
  const nodeA = await pipelineRepository.createScript({
    name: "Stripe Check",
    code: `
      local res = await(helpers.fetch("https://api.stripe.com/v1/sub", { 
        headers = { Authorization = "Bearer " .. helpers.secret("STRIPE_KEY") } 
      }))
      helpers.log("Stripe Fetch Status: " .. tostring(res.status))
      helpers.log("Stripe Fetch OK: " .. tostring(res.ok))
      
      if res.ok then
        return { allowed = true, data = { subscription = "active", from = "A" } }
      else
        return { allowed = false, error = "Stripe failed" }
      end
    `,
  });

  // Node B (Parallel 2): Local calculation
  const nodeB = await pipelineRepository.createScript({
    name: "Risk Score",
    code: `
      return { allowed = true, data = { risk = 10, from = "B" } }
    `,
  });

  // Node C (Consumer): Uses A and B
  const nodeC = await pipelineRepository.createScript({
    name: "Final Decision",
    code: `
      local sub = context.outputs['${nodeA.id}'].subscription
      local risk = context.outputs['${nodeB.id}'].risk
      
      if sub == "active" and risk < 50 then
         return { allowed = true, data = { decision = "approved", merged = true } }
      else
         return { allowed = false, error = "Policy rejected" }
      end
    `,
  });

  // 2. Wire Up: [ [A, B], [C] ]
  await pipelineRepository.updateExecutionPlan("advanced_dag", [
    [nodeA.id, nodeB.id], // Layer 1: Parallel
    [nodeC.id]            // Layer 2: Dependent
  ]);

  // 3. Mock Fetch Implementation (Monkey Patching for Test)
  // In real implementation, we mocked in the class, but here we verify the class logic
  // The class has a private mocked 'safeFetch' that checks whitelist.
  // We need to ensure 'api.stripe.com' is allowed. It is in the class config.

  // 4. Execution
  console.log("Executing DAG...");
  // We need to Mock the global fetch for Node 20 environment if it doesn't exist or we want to intercept
  // Since we are in 'tsx', global fetch exists. We need to mock the NETWORK call or the Engine's safeFetch.
  // Pro-tip: We can't easily mock the private safeFetch from here.
  // But we CAN mock the global fetch used BY safeFetch.

  const originalFetch = global.fetch;
  const mockFetch = async (url: string | URL | Request, _options?: RequestInit) => {
    const u = url.toString();
    if (u.includes("api.stripe.com")) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  };
  global.fetch = mockFetch;

  try {
    const result = await pipelineEngine.executeTrigger("advanced_dag", {});
    console.log("DAG Result:", JSON.stringify(result, null, 2));

    if (result.data?.decision !== "approved") {
      throw new Error("DAG Logic failed: " + JSON.stringify(result));
    }
  } finally {
    global.fetch = originalFetch;
  }

  console.log("PASS: Advanced DAG Verified");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
