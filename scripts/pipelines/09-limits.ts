/**
 * DEMO 09: Limits Validation
 * Tests that chain depth and parallel node limits are enforced.
 */
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- DEMO 09: Limits Validation ---\n");

    // ==========================================================================
    // TEST 1: Chain Depth Limit (Max 10 layers)
    // ==========================================================================
    console.log("TEST 1: Chain Depth Limit (Max 10 layers)");

    // Create 11 simple scripts
    const chainScripts: string[] = [];
    for (let i = 0; i < 11; i++) {
        const script = await pipelineRepository.createScript({
            name: `chain_${i}`,
            code: `return { allowed = true, data = { step = ${i} } }`
        });
        chainScripts.push(script.id);
    }

    // Create a plan with 11 layers (exceeds 10)
    await pipelineRepository.updateExecutionPlan(
        "chain_limit_test",
        chainScripts.map(s => [s]) // Each script in its own layer = 11 layers
    );

    const chainResult = await pipelineEngine.executeTrigger("chain_limit_test", {});
    console.log("  11 Layers Result:", chainResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${chainResult.error}`);
    console.log("  Status:", chainResult.allowed === false && chainResult.error?.includes("chain depth")
        ? "✅ PASS" : "❌ FAIL");

    // ==========================================================================
    // TEST 2: Parallel Node Limit (Max 5 per layer)
    // ==========================================================================
    console.log("\nTEST 2: Parallel Node Limit (Max 5 per layer)");

    // Create 6 parallel scripts
    const parallelScripts: string[] = [];
    for (let i = 0; i < 6; i++) {
        const script = await pipelineRepository.createScript({
            name: `parallel_${i}`,
            code: `return { allowed = true, data = { node = ${i} } }`
        });
        parallelScripts.push(script.id);
    }

    // Create a plan with 6 parallel nodes in one layer (exceeds 5)
    await pipelineRepository.updateExecutionPlan(
        "parallel_limit_test",
        [parallelScripts] // All 6 scripts in same layer
    );

    const parallelResult = await pipelineEngine.executeTrigger("parallel_limit_test", {});
    console.log("  6 Parallel Result:", parallelResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${parallelResult.error}`);
    console.log("  Status:", parallelResult.allowed === false && parallelResult.error?.includes("parallel nodes")
        ? "✅ PASS" : "❌ FAIL");

    // ==========================================================================
    // TEST 3: Within Limits (Should Pass)
    // ==========================================================================
    console.log("\nTEST 3: Within Limits (5 parallel, 3 layers)");

    const validScripts: string[] = [];
    for (let i = 0; i < 5; i++) {
        const script = await pipelineRepository.createScript({
            name: `valid_${i}`,
            code: `return { allowed = true, data = { ok = ${i} } }`
        });
        validScripts.push(script.id);
    }

    // 3 layers with 5 parallel each (within limits)
    await pipelineRepository.updateExecutionPlan(
        "valid_limit_test",
        [
            validScripts.slice(0, 3),  // Layer 1: 3 scripts
            validScripts.slice(3, 5),  // Layer 2: 2 scripts
        ]
    );

    const validResult = await pipelineEngine.executeTrigger("valid_limit_test", {});
    console.log("  Valid Config Result:", validResult.allowed ? "ALLOWED ✅" : `BLOCKED: ${validResult.error}`);
    console.log("  Status:", validResult.allowed === true ? "✅ PASS" : "❌ FAIL");

    console.log("\n--- DEMO 09 Complete ---");
}

main().catch(console.error);
