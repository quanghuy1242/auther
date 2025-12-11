import { LuaFactory, LuaEngine } from "wasmoon";
import { getWasmPath } from "../utils/wasm-path";

export interface PooledEngine {
    engine: LuaEngine;
    inUse: boolean;
    createdAt: number;
}

export class LuaEnginePool {
    private factory: LuaFactory;
    private pool: PooledEngine[] = [];
    private maxPoolSize = 20; // Increased from 10
    private creatingCount = 0;
    private ttlMs = 1000 * 60 * 5; // 5 minutes

    // Throttling
    private readonly maxConcurrent = 20; // Hard limit on active engines
    private waitingQueue: Array<() => void> = [];

    constructor() {
        this.factory = new LuaFactory(getWasmPath());
    }

    /**
     * Acquires a Lua execution engine from the pool.
     * If the pool is empty and not full, creates a new one.
     * If at max concurrent, waits in queue.
     */
    async acquire(): Promise<PooledEngine> {
        this.cleanup();

        // THROTTLE: Check if we're at max concurrent
        const activeCount = this.pool.filter(p => p.inUse).length + this.creatingCount;
        if (activeCount >= this.maxConcurrent) {
            // Wait for a release signal
            await new Promise<void>(resolve => this.waitingQueue.push(resolve));
        }

        // Try to find an available engine
        const available = this.pool.find((p) => !p.inUse);
        if (available) {
            available.inUse = true;
            return available;
        }

        // Check against pool size AND pending creations
        if (this.pool.length + this.creatingCount < this.maxPoolSize) {
            this.creatingCount++;
            try {
                const engine = await this.factory.createEngine({ openStandardLibs: true, injectObjects: true });
                const pooled: PooledEngine = {
                    engine,
                    inUse: true, // Mark in use immediately
                    createdAt: Date.now(),
                };
                this.pool.push(pooled);
                return pooled;
            } finally {
                this.creatingCount--;
            }
        }

        // Pool is full, force create a temp one (burst)
        const engine = await this.factory.createEngine({ openStandardLibs: true, injectObjects: true });
        return {
            engine,
            inUse: true,
            createdAt: Date.now(),
        };
    }

    /**
     * Releases an engine back to the pool or closes it if over capacity.
     */
    release(pooled: PooledEngine) {
        pooled.inUse = false;

        // If this engine was a "burst" engine (pool is over capacity), close and remove it.
        if (this.pool.length > this.maxPoolSize) {
            // Identify if this specific object is in the pool
            const index = this.pool.indexOf(pooled);
            if (index === -1) {
                // It wasn't in the pool (or was removed), just close it
                pooled.engine.global.close();
                this.signalWaiting();
                return;
            }
            // If it IS in the pool, we generally leave it unless we implement stricter LRU for burst.
        }

        // If it wasn't in the pool array (because we created it as burst and didn't push), close it.
        if (!this.pool.includes(pooled)) {
            pooled.engine.global.close();
        }

        // Signal next waiting caller
        this.signalWaiting();
    }

    /**
     * Signals the next waiting caller that an engine is available.
     */
    private signalWaiting() {
        const next = this.waitingQueue.shift();
        if (next) next();
    }

    /**
     * Removes expired engines from the pool.
     */
    private cleanup() {
        const now = Date.now();
        this.pool = this.pool.filter((p) => {
            if (!p.inUse && now - p.createdAt > this.ttlMs) {
                p.engine.global.close();
                return false;
            }
            return true;
        });
    }

    /**
     * Debug method to view pool status
     */
    getStats() {
        return {
            total: this.pool.length,
            inUse: this.pool.filter((p) => p.inUse).length,
        };
    }
}

// Singleton instance for the application
export const luaEnginePool = new LuaEnginePool();
