import { ProcessNode } from "./process-node";
import { ForkNode } from "./fork-node";
import { JoinNode } from "./join-node";
import { ScriptNode } from "./script-node";
import { AddLayerNode } from "./add-layer-node";
import { HookGroupNode } from "./hook-group-node";
import { HookPointNode } from "./hook-point-node";

export const nodeTypes = {
    process: ProcessNode,
    fork: ForkNode,
    join: JoinNode,
    script: ScriptNode,
    addLayer: AddLayerNode,
    hookGroup: HookGroupNode,
    hookPoint: HookPointNode,
};

export { ProcessNode, ForkNode, JoinNode, ScriptNode, AddLayerNode, HookGroupNode, HookPointNode };
export type { ProcessNodeData } from "./process-node";
export type { ForkNodeData } from "./fork-node";
export type { JoinNodeData } from "./join-node";
export type { ScriptNodeData } from "./script-node";
export type { AddLayerNodeData } from "./add-layer-node";
export type { HookGroupNodeData } from "./hook-group-node";
export type { HookPointNodeData } from "./hook-point-node";
