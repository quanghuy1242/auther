import { db } from "../db";
import {
    pipelineScripts,
    pipelineGraph,
    pipelineExecutionPlan,
    pipelineTraces,
    pipelineSpans,
} from "../../db/pipeline-schema";
import { eq, lt } from "drizzle-orm";


export type PipelineScript = typeof pipelineScripts.$inferSelect;
export type PipelineGraph = typeof pipelineGraph.$inferSelect;
export type PipelineExecutionPlan = typeof pipelineExecutionPlan.$inferSelect;
export type PipelineTrace = typeof pipelineTraces.$inferSelect;
export type PipelineSpan = typeof pipelineSpans.$inferSelect;

export class PipelineRepository {
    /* -------------------------------------------------------------------------- */
    /*                               Scripts (Logic)                              */
    /* -------------------------------------------------------------------------- */

    async createScript(data: {
        name: string;
        code: string;
        config?: Record<string, unknown>;
    }): Promise<PipelineScript> {
        const [script] = await db
            .insert(pipelineScripts)
            .values({
                id: crypto.randomUUID(),
                name: data.name,
                code: data.code,
                config: data.config ? JSON.stringify(data.config) : null,
            })
            .returning();
        return script;
    }

    async updateScript(
        id: string,
        data: { name?: string; code?: string; config?: Record<string, unknown> }
    ): Promise<PipelineScript | undefined> {
        const toUpdate: Partial<typeof pipelineScripts.$inferInsert> = {};
        if (data.name) toUpdate.name = data.name;
        if (data.code) toUpdate.code = data.code;
        if (data.config !== undefined)
            toUpdate.config = data.config ? JSON.stringify(data.config) : null;

        const [updated] = await db
            .update(pipelineScripts)
            .set(toUpdate)
            .where(eq(pipelineScripts.id, id))
            .returning();
        return updated;
    }

    async getScript(id: string): Promise<PipelineScript | undefined> {
        const script = await db.query.pipelineScripts.findFirst({
            where: eq(pipelineScripts.id, id),
        });
        return script;
    }

    async listScripts(): Promise<PipelineScript[]> {
        return db.query.pipelineScripts.findMany();
    }

    async deleteScript(id: string): Promise<void> {
        await db.delete(pipelineScripts).where(eq(pipelineScripts.id, id));
    }

    /* -------------------------------------------------------------------------- */
    /*                                Graph (Layout)                              */
    /* -------------------------------------------------------------------------- */

    async saveGraph(data: {
        nodes: unknown[];
        edges: unknown[];
    }): Promise<PipelineGraph> {
        const id = "default";
        const values = {
            id,
            nodes: JSON.stringify(data.nodes),
            edges: JSON.stringify(data.edges),
        };

        const [graph] = await db
            .insert(pipelineGraph)
            .values(values)
            .onConflictDoUpdate({
                target: pipelineGraph.id,
                set: {
                    nodes: values.nodes,
                    edges: values.edges,
                    updatedAt: new Date(), // Standard implementation usually handles this, but explicit here
                },
            })
            .returning();
        return graph;
    }

    async getGraph(): Promise<PipelineGraph | undefined> {
        return db.query.pipelineGraph.findFirst({
            where: eq(pipelineGraph.id, "default"),
        });
    }

    /* -------------------------------------------------------------------------- */
    /*                           Execution Plan (Runtime)                         */
    /* -------------------------------------------------------------------------- */

    /**
     * Updates the execution plan for a specific trigger.
     * This is usually called after analyzing the graph.
     */
    async updateExecutionPlan(
        triggerEvent: string,
        nodeOrder: string[][]
    ): Promise<void> {
        await db
            .insert(pipelineExecutionPlan)
            .values({
                id: crypto.randomUUID(),
                triggerEvent,
                nodeOrder: JSON.stringify(nodeOrder),
            })
            .onConflictDoUpdate({
                target: pipelineExecutionPlan.triggerEvent,
                set: {
                    nodeOrder: JSON.stringify(nodeOrder),
                },
            });
    }

    /**
     * Retrieves the optimized execution plan for a trigger.
     * This is what the Runtime Engine calls.
     */
    async getExecutionPlan(triggerEvent: string): Promise<string[][] | null> {
        const plan = await db.query.pipelineExecutionPlan.findFirst({
            where: eq(pipelineExecutionPlan.triggerEvent, triggerEvent),
        });
        return plan ? JSON.parse(plan.nodeOrder) : null;
    }

    /* -------------------------------------------------------------------------- */
    /*                        Traces & Spans (Observability)                      */
    /* -------------------------------------------------------------------------- */

    /**
     * Creates a trace record for a pipeline execution.
     */
    async createTrace(data: {
        id: string;
        triggerEvent: string;
        status: string;
        statusMessage?: string;
        startedAt: Date;
        endedAt: Date;
        durationMs: number;
        userId?: string;
        requestIp?: string;
        contextSnapshot?: string;
        resultData?: string;
    }): Promise<PipelineTrace> {
        const [trace] = await db
            .insert(pipelineTraces)
            .values({
                id: data.id,
                triggerEvent: data.triggerEvent,
                status: data.status,
                statusMessage: data.statusMessage,
                startedAt: data.startedAt,
                endedAt: data.endedAt,
                durationMs: data.durationMs,
                userId: data.userId,
                requestIp: data.requestIp,
                contextSnapshot: data.contextSnapshot,
                resultData: data.resultData,
            })
            .returning();
        return trace;
    }

    /**
     * Creates span records for script executions within a trace.
     */
    async createSpans(spans: Array<{
        id: string;
        traceId: string;
        name: string;
        scriptId: string;
        layerIndex: number;
        parallelIndex: number;
        status: string;
        statusMessage?: string;
        startedAt: Date;
        endedAt?: Date;
        durationMs?: number;
        attributes?: string;
    }>): Promise<void> {
        if (spans.length === 0) return;
        await db.insert(pipelineSpans).values(spans);
    }

    /**
     * Retrieves a trace with its spans.
     */
    async getTraceWithSpans(traceId: string): Promise<{
        trace: PipelineTrace | undefined;
        spans: PipelineSpan[];
    }> {
        const trace = await db.query.pipelineTraces.findFirst({
            where: eq(pipelineTraces.id, traceId),
        });
        const spans = await db.query.pipelineSpans.findMany({
            where: eq(pipelineSpans.traceId, traceId),
        });
        return { trace, spans };
    }

    /**
     * Lists recent traces for a trigger event.
     */
    async listTraces(options?: {
        triggerEvent?: string;
        limit?: number;
    }): Promise<PipelineTrace[]> {
        // Simple implementation - can be extended with more filters
        if (options?.triggerEvent) {
            return db.query.pipelineTraces.findMany({
                where: eq(pipelineTraces.triggerEvent, options.triggerEvent),
                limit: options.limit || 50,
                orderBy: (traces, { desc }) => [desc(traces.createdAt)],
            });
        }
        return db.query.pipelineTraces.findMany({
            limit: options?.limit || 50,
            orderBy: (traces, { desc }) => [desc(traces.createdAt)],
        });
    }

    /**
     * Deletes traces and spans older than the specified cutoff date.
     */
    async cleanupOldTraces(cutoffDate: Date): Promise<{
        deletedSpans: number;
        deletedTraces: number;
    }> {
        const deletedSpans = await db
            .delete(pipelineSpans)
            .where(lt(pipelineSpans.startedAt, cutoffDate))
            .returning({ id: pipelineSpans.id });

        const deletedTraces = await db
            .delete(pipelineTraces)
            .where(lt(pipelineTraces.createdAt, cutoffDate))
            .returning({ id: pipelineTraces.id });

        return {
            deletedSpans: deletedSpans.length,
            deletedTraces: deletedTraces.length,
        };
    }
}

export const pipelineRepository = new PipelineRepository();
