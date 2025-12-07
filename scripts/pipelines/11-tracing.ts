/**
 * 11-tracing.ts - Test Pipeline Tracing & Observability
 * 
 * Verifies that pipeline execution creates traces and spans,
 * and that they can be retrieved via the repository.
 */
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { PipelineEngine } from "../../src/lib/auth/pipeline-engine";
import { appendFileSync } from "fs";

const LOG_FILE = "./scripts/pipelines/result.log";
function log(msg: string) {
    console.log(msg);
    appendFileSync(LOG_FILE, msg + "\n");
}

async function main() {
    log("\n========================================");
    log("11. TRACING TEST");
    log("========================================");

    const engine = new PipelineEngine();

    // --- Setup: Create test scripts ---
    const successScript = await pipelineRepository.createScript({
        name: "Tracing Success",
        code: `
            helpers.log("Tracing test - success path")
            return { allowed = true, data = { traced = true, timestamp = helpers.now() } }
        `,
    });

    const blockingScript = await pipelineRepository.createScript({
        name: "Tracing Blocker",
        code: `
            helpers.log("Tracing test - blocking path")
            return { allowed = false, error = "Blocked for tracing test" }
        `,
    });

    log(`✓ Created test scripts: ${successScript.id}, ${blockingScript.id}`);

    // --- Test 1: Success path creates trace ---
    log("\n--- Test 1: Success Path Tracing ---");
    await pipelineRepository.updateExecutionPlan("test_trace_success", [[successScript.id]]);

    const successResult = await engine.executeTrigger(
        "test_trace_success",
        { userId: "user_123", action: "test" },
        { userId: "user_123", requestIp: "127.0.0.1" }
    );

    if (successResult.allowed && successResult.data?.traced) {
        log("✓ Pipeline executed successfully with traced data");
    } else {
        log(`✗ Expected success with traced data, got: ${JSON.stringify(successResult)}`);
        process.exit(1);
    }

    // Verify trace was created
    const successTraces = await pipelineRepository.listTraces({ triggerEvent: "test_trace_success", limit: 1 });
    if (successTraces.length > 0) {
        const trace = successTraces[0];
        log(`✓ Trace created: ${trace.id}`);
        log(`  Status: ${trace.status}`);
        log(`  Duration: ${trace.durationMs}ms`);
        log(`  User ID: ${trace.userId}`);
        log(`  Request IP: ${trace.requestIp}`);

        // Verify spans
        const { spans } = await pipelineRepository.getTraceWithSpans(trace.id);
        if (spans.length > 0) {
            log(`✓ Span created: ${spans[0].name} (${spans[0].status})`);
            log(`  Script ID: ${spans[0].scriptId}`);
            log(`  Duration: ${spans[0].durationMs}ms`);
        } else {
            log("✗ No spans found for trace");
            process.exit(1);
        }
    } else {
        log("✗ No trace created for success path");
        process.exit(1);
    }

    // --- Test 2: Blocked path creates trace ---
    log("\n--- Test 2: Blocked Path Tracing ---");
    await pipelineRepository.updateExecutionPlan("test_trace_blocked", [[blockingScript.id]]);

    const blockedResult = await engine.executeTrigger(
        "test_trace_blocked",
        { userId: "user_456", action: "blocked_test" },
        { userId: "user_456", requestIp: "192.168.1.1" }
    );

    if (!blockedResult.allowed) {
        log("✓ Pipeline correctly blocked");
    } else {
        log(`✗ Expected blocked, got: ${JSON.stringify(blockedResult)}`);
        process.exit(1);
    }

    // Verify blocked trace
    const blockedTraces = await pipelineRepository.listTraces({ triggerEvent: "test_trace_blocked", limit: 1 });
    if (blockedTraces.length > 0) {
        const trace = blockedTraces[0];
        log(`✓ Blocked trace created: ${trace.id}`);
        log(`  Status: ${trace.status}`);
        log(`  Status Message: ${trace.statusMessage}`);

        const { spans } = await pipelineRepository.getTraceWithSpans(trace.id);
        if (spans.length > 0 && spans[0].status === "blocked") {
            log(`✓ Blocked span: ${spans[0].name} (${spans[0].status})`);
        } else {
            log("✗ Span not marked as blocked");
            process.exit(1);
        }
    } else {
        log("✗ No trace created for blocked path");
        process.exit(1);
    }

    // --- Test 3: Multi-layer DAG tracing ---
    log("\n--- Test 3: Multi-Layer DAG Tracing ---");
    const layer1Script = await pipelineRepository.createScript({
        name: "DAG Layer 1",
        code: `return { allowed = true, data = { layer = 1 } }`,
    });
    const layer2Script = await pipelineRepository.createScript({
        name: "DAG Layer 2",
        code: `return { allowed = true, data = { layer = 2, prev_layer = context.prev.layer } }`,
    });

    await pipelineRepository.updateExecutionPlan("test_trace_dag", [
        [layer1Script.id],
        [layer2Script.id],
    ]);

    const dagResult = await engine.executeTrigger(
        "test_trace_dag",
        { test: "dag" },
        { userId: "dag_user" }
    );

    if (dagResult.allowed) {
        log("✓ DAG pipeline executed successfully");
    }

    const dagTraces = await pipelineRepository.listTraces({ triggerEvent: "test_trace_dag", limit: 1 });
    if (dagTraces.length > 0) {
        const { trace, spans } = await pipelineRepository.getTraceWithSpans(dagTraces[0].id);
        log(`✓ DAG trace: ${trace?.id}`);
        log(`  Total spans: ${spans.length}`);

        for (const span of spans) {
            log(`  - Layer ${span.layerIndex}: ${span.name} (${span.status})`);
        }

        if (spans.length === 2) {
            log("✓ Both layers traced correctly");
        } else {
            log(`✗ Expected 2 spans, got ${spans.length}`);
            process.exit(1);
        }
    }

    // --- Cleanup test data ---
    log("\n--- Cleanup ---");
    await pipelineRepository.deleteScript(successScript.id);
    await pipelineRepository.deleteScript(blockingScript.id);
    await pipelineRepository.deleteScript(layer1Script.id);
    await pipelineRepository.deleteScript(layer2Script.id);
    log("✓ Test scripts cleaned up");

    log("\n========================================");
    log("✓ ALL TRACING TESTS PASSED");
    log("========================================\n");
}

main().catch((err) => {
    log(`\n✗ TRACING TEST FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
});
