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

    // Cleanup Test 1-3 scripts
    await pipelineRepository.deleteScript(successScript.id);
    await pipelineRepository.deleteScript(blockingScript.id);
    await pipelineRepository.deleteScript(layer1Script.id);
    await pipelineRepository.deleteScript(layer2Script.id);
    log("✓ Test 1-3 scripts cleaned up");

    // =========================================================================
    // Test 5: Custom Nested Tracing (helpers.trace)
    // =========================================================================
    log("\n--- Test 5: Custom Nested Tracing ---");

    // 1. Create script using helpers.trace()
    const traceScript = await pipelineRepository.createScript({
        name: "Trace Test Script",
        code: `
        helpers.log('Starting custom traces')
        
        -- Level 1: Main Task
        return helpers.trace('Main Task', { category = 'root' }, function()
            helpers.log('Inside Main Task')
            
            -- Level 2: Subtask A (with attributes)
            helpers.trace('Subtask A', { meta = 'test-data', count = 42 }, function()
                helpers.log('Inside Subtask A')
                
                -- Level 3: Deep Task (Should EXECUTE but NOT CREATE SPAN due to depth limit)
                helpers.trace('Deep Task', function()
                    helpers.log('Inside Deep Task')
                end)
            end)

            -- Level 2: Subtask B
            helpers.trace('Subtask B', { note = 'parallel-ish' }, function()
                helpers.log('Inside Subtask B')
            end)

            return { traced = true }
        end)
        `
    });

    if (!traceScript) throw new Error("Failed to create trace script");

    // Add to 'trace_test' hook
    await pipelineRepository.updateExecutionPlan("trace_test", [[traceScript.id]]);

    // 2. Execute
    log("Triggering trace_test...");
    const traceResult = await engine.executeTrigger("trace_test", { test: 5 });
    log(`Trace Result: ${JSON.stringify(traceResult)}`);

    if (!traceResult.allowed) {
        throw new Error("Pipeline execution failed");
    }

    // 3. Verify Trace & Spans
    // Wait for async persistence
    await new Promise(r => setTimeout(r, 100));

    // Find trace
    const traces5 = await pipelineRepository.listTraces({ triggerEvent: "trace_test", limit: 1 });
    const trace5 = traces5[0];

    if (!trace5 || trace5.triggerEvent !== "trace_test") {
        log("✗ Latest trace not found or mismatch. Skipping span verification.");
        process.exit(1);
    } else {
        const { spans } = await pipelineRepository.getTraceWithSpans(trace5.id);
        log(`✓ Found ${spans.length} spans.`);

        // 3a. Verify Script Span
        const scriptSpan = spans.find(s => s.name === "Trace Test Script");
        if (!scriptSpan) {
            log("✗ Script span missing");
            process.exit(1);
        }

        // 3b. Verify Custom Spans
        const mainSpan = spans.find(s => s.name === "Main Task");
        if (!mainSpan) {
            log("✗ Main Task custom span missing");
            process.exit(1);
        }
        if (mainSpan.parentSpanId !== scriptSpan.id) {
            log("✗ Main Task should be child of Script Span");
            process.exit(1);
        }
        if (!mainSpan.attributes?.includes('"category":"root"')) {
            log("✗ Main Task attributes missing");
            process.exit(1);
        }

        const subASpan = spans.find(s => s.name === "Subtask A");
        if (!subASpan) {
            log("✗ Subtask A custom span missing");
            process.exit(1);
        }
        if (subASpan.parentSpanId !== mainSpan.id) {
            log("✗ Subtask A should be child of Main Task");
            process.exit(1);
        }
        if (!subASpan.attributes?.includes('"meta":"test-data"')) {
            log("✗ Subtask A attributes missing");
            process.exit(1);
        }

        const subBSpan = spans.find(s => s.name === "Subtask B");
        if (!subBSpan) {
            log("✗ Subtask B custom span missing");
            process.exit(1);
        }
        if (subBSpan.parentSpanId !== mainSpan.id) {
            log("✗ Subtask B should be child of Main Task");
            process.exit(1);
        }

        // 3c. Verify Depth Limit (Deep Task should NOT exist)
        const deepSpan = spans.find(s => s.name === "Deep Task");
        if (deepSpan) {
            log("✗ Deep Task span should NOT exist (max depth 2)");
            process.exit(1);
        }

        log("✓ Custom nested spans verified successfully");
    }

    // Cleanup Test 5
    await pipelineRepository.deleteScript(traceScript.id);
    await pipelineRepository.updateExecutionPlan("trace_test", []);
    log("✓ Custom nested tracing test scripts cleaned up");

    // --- Test 4: Complex Parallel + Sequential Tracing ---
    log("\n--- Test 4: Complex Parallel Execution Tracing ---");

    // Create scripts for parallel execution
    const parallelA = await pipelineRepository.createScript({
        name: "Geo Blocker",
        code: `
            -- Simulate some work
            local start = helpers.now()
            while helpers.now() - start < 5 do end
            helpers.log("Geo check completed")
            return { allowed = true, data = { geo = "US", risk = "low" } }
        `,
    });
    const parallelB = await pipelineRepository.createScript({
        name: "Rate Limiter",
        code: `
            -- Simulate some work
            local start = helpers.now()
            while helpers.now() - start < 8 do end
            helpers.log("Rate limit check completed")
            return { allowed = true, data = { rate = "ok", limit = 100 } }
        `,
    });
    const parallelC = await pipelineRepository.createScript({
        name: "IP Validator",
        code: `
            -- Simulate some work  
            local start = helpers.now()
            while helpers.now() - start < 3 do end
            helpers.log("IP validated")
            return { allowed = true, data = { ip = "valid", country = "US" } }
        `,
    });

    // Layer 2: Two parallel enrichment scripts
    const enrichA = await pipelineRepository.createScript({
        name: "Fetch Profile",
        code: `
            local start = helpers.now()
            while helpers.now() - start < 10 do end
            return { allowed = true, data = { profile = "loaded" } }
        `,
    });
    const enrichB = await pipelineRepository.createScript({
        name: "Load Permissions",
        code: `
            local start = helpers.now()
            while helpers.now() - start < 6 do end
            return { allowed = true, data = { permissions = { "read", "write" } } }
        `,
    });

    // Layer 3: Final aggregation
    const finalScript = await pipelineRepository.createScript({
        name: "Aggregate Results",
        code: `
            helpers.log("Aggregating all results")
            return { allowed = true, data = { finalResult = "complete", prev = context.prev } }
        `,
    });

    log(`✓ Created 6 parallel test scripts`);

    // Set up execution plan with parallel layers:
    // Layer 0: [Geo Blocker, Rate Limiter, IP Validator] - run in parallel
    // Layer 1: [Fetch Profile, Load Permissions] - run in parallel
    // Layer 2: [Aggregate Results] - single script
    await pipelineRepository.updateExecutionPlan("test_complex_parallel", [
        [parallelA.id, parallelB.id, parallelC.id],  // Layer 0: 3 parallel
        [enrichA.id, enrichB.id],                      // Layer 1: 2 parallel
        [finalScript.id],                              // Layer 2: 1 sequential
    ]);

    const complexResult = await engine.executeTrigger(
        "test_complex_parallel",
        { userId: "complex_user", action: "signup" },
        { userId: "complex_user", requestIp: "10.0.0.1" }
    );

    if (complexResult.allowed) {
        log("✓ Complex parallel pipeline executed successfully");
    } else {
        log(`✗ Complex parallel pipeline failed: ${JSON.stringify(complexResult)}`);
        process.exit(1);
    }

    // Wait for trace to be persisted (fire-and-forget)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify complex trace
    const complexTraces = await pipelineRepository.listTraces({ triggerEvent: "test_complex_parallel", limit: 1 });
    if (complexTraces.length > 0) {
        const { trace, spans } = await pipelineRepository.getTraceWithSpans(complexTraces[0].id);
        log(`✓ Complex trace: ${trace?.id}`);
        log(`  Total duration: ${trace?.durationMs}ms`);
        log(`  Total spans: ${spans.length}`);

        // Group by layer for display
        const byLayer: Record<number, typeof spans> = {};
        for (const span of spans) {
            if (!byLayer[span.layerIndex]) byLayer[span.layerIndex] = [];
            byLayer[span.layerIndex].push(span);
        }

        for (const layer of Object.keys(byLayer).map(Number).sort()) {
            log(`  Layer ${layer}:`);
            for (const span of byLayer[layer]) {
                const startOffset = new Date(span.startedAt).getTime() - new Date(trace!.startedAt).getTime();
                log(`    - ${span.name}: ${span.durationMs}ms (started at +${startOffset}ms)`);
            }
        }

        if (spans.length === 6) {
            log("✓ All 6 spans traced correctly");

            // Verify parallel execution: Layer 0 spans should start at nearly the same time
            const layer0Spans = byLayer[0];
            if (layer0Spans && layer0Spans.length === 3) {
                const startTimes = layer0Spans.map(s => new Date(s.startedAt).getTime());
                const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
                log(`  Layer 0 start time variance: ${maxDiff}ms (should be <5ms for parallel)`);
            }
        } else {
            log(`✗ Expected 6 spans, got ${spans.length}`);
            process.exit(1);
        }
    } else {
        log("✗ No complex trace found - this may be a timing issue");
        process.exit(1);
    }

    // Cleanup Test 4 scripts
    await pipelineRepository.deleteScript(parallelA.id);
    await pipelineRepository.deleteScript(parallelB.id);
    await pipelineRepository.deleteScript(parallelC.id);
    await pipelineRepository.deleteScript(enrichA.id);
    await pipelineRepository.deleteScript(enrichB.id);
    await pipelineRepository.deleteScript(finalScript.id);
    log("✓ Complex parallel test scripts cleaned up");

    log("\n========================================");
    log("✓ ALL TRACING TESTS PASSED");
    log("========================================\n");
}

main().catch((err) => {
    log(`\n✗ TRACING TEST FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
});
