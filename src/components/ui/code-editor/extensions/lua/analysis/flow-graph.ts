// =============================================================================
// FLOW GRAPH
// =============================================================================
// Control flow graph for type narrowing
// Port of EmmyLua's db_index/flow/ module
// See: https://github.com/EmmyLuaLs/emmylua-analyzer-rust/tree/main/crates/emmylua_code_analysis/src/db_index/flow

import type { LuaNode } from "../core/luaparse-types";

// =============================================================================
// FLOW ID
// =============================================================================

/**
 * Unique identifier for flow nodes
 * Port of EmmyLua's FlowId
 */
export type FlowId = number;

// =============================================================================
// FLOW ANTECEDENT
// =============================================================================

/**
 * Represents how flow nodes are connected
 * Port of EmmyLua's FlowAntecedent
 */
export type FlowAntecedent =
    | { kind: "single"; id: FlowId }
    | { kind: "multiple"; index: number };

// =============================================================================
// FLOW NODE KIND
// =============================================================================

/**
 * Different types of flow nodes in the control flow graph
 * Port of EmmyLua's FlowNodeKind
 */
export enum FlowNodeKind {
    /** Entry point of the flow */
    Start = "start",
    /** Unreachable code (after return/break) */
    Unreachable = "unreachable",
    /** Label for branching (if/else) */
    BranchLabel = "branch_label",
    /** Label for loops (while, for, repeat) */
    LoopLabel = "loop_label",
    /** Named label (goto target) */
    NamedLabel = "named_label",
    /** Declaration position */
    DeclPosition = "decl_position",
    /** Variable assignment */
    Assignment = "assignment",
    /** Conditional flow - truthy branch (type guards) */
    TrueCondition = "true_condition",
    /** Conditional flow - falsy branch (type guards) */
    FalseCondition = "false_condition",
    /** For loop initialization */
    ForIStat = "for_i_stat",
    /** Break statement */
    Break = "break",
    /** Return statement */
    Return = "return",
}

// =============================================================================
// FLOW NODE
// =============================================================================

/**
 * Main flow node structure containing all flow analysis information
 * Port of EmmyLua's FlowNode
 */
export interface FlowNode {
    id: FlowId;
    kind: FlowNodeKind;
    antecedent?: FlowAntecedent;
    /** Additional data based on kind */
    data?: FlowNodeData;
}

/**
 * Data associated with specific flow node kinds
 */
export type FlowNodeData =
    | { kind: "decl_position"; offset: number }
    | { kind: "assignment"; node: LuaNode }
    | { kind: "condition"; node: LuaNode }
    | { kind: "named_label"; name: string };

// =============================================================================
// FLOW TREE
// =============================================================================

/**
 * The complete flow graph for a document
 * Port of EmmyLua's FlowTree
 */
export class FlowTree {
    private nodes: FlowNode[] = [];
    private multipleAntecedents: FlowId[][] = [];
    /** Maps AST offset to FlowId */
    private bindings: Map<number, FlowId> = new Map();

    /**
     * Get the flow ID for a given AST offset
     */
    getFlowId(offset: number): FlowId | undefined {
        return this.bindings.get(offset);
    }

    /**
     * Get a flow node by ID
     */
    getFlowNode(id: FlowId): FlowNode | undefined {
        return this.nodes[id];
    }

    /**
     * Get multiple antecedents by index
     */
    getMultiAntecedents(index: number): FlowId[] | undefined {
        return this.multipleAntecedents[index];
    }

    /**
     * Add a new flow node
     */
    addNode(
        kind: FlowNodeKind,
        antecedent?: FlowAntecedent,
        data?: FlowNodeData
    ): FlowId {
        const id = this.nodes.length;
        this.nodes.push({ id, kind, antecedent, data });
        return id;
    }

    /**
     * Add multiple antecedents and return the index
     */
    addMultipleAntecedents(ids: FlowId[]): number {
        const index = this.multipleAntecedents.length;
        this.multipleAntecedents.push(ids);
        return index;
    }

    /**
     * Bind an AST offset to a flow ID
     */
    bindOffset(offset: number, flowId: FlowId): void {
        this.bindings.set(offset, flowId);
    }

    /**
     * Get all nodes (for debugging)
     */
    getAllNodes(): FlowNode[] {
        return this.nodes;
    }

    /**
     * Check if tree is empty
     */
    isEmpty(): boolean {
        return this.nodes.length === 0;
    }
}

// =============================================================================
// FLOW UTILITIES
// =============================================================================

/**
 * Get single antecedent from a flow node
 * Port of EmmyLua's get_single_antecedent
 */
export function getSingleAntecedent(
    tree: FlowTree,
    node: FlowNode
): FlowId | undefined {
    if (!node.antecedent) return undefined;

    if (node.antecedent.kind === "single") {
        return node.antecedent.id;
    }

    // For multiple, get first one
    const multiFlow = tree.getMultiAntecedents(node.antecedent.index);
    return multiFlow && multiFlow.length > 0 ? multiFlow[0] : undefined;
}

/**
 * Get all antecedents from a flow node
 * Port of EmmyLua's get_multi_antecedents
 */
export function getMultiAntecedents(
    tree: FlowTree,
    node: FlowNode
): FlowId[] {
    if (!node.antecedent) return [];

    if (node.antecedent.kind === "single") {
        return [node.antecedent.id];
    }

    return tree.getMultiAntecedents(node.antecedent.index) ?? [];
}

/**
 * Check if a flow node kind is a condition
 */
export function isConditionalFlowNode(kind: FlowNodeKind): boolean {
    return kind === FlowNodeKind.TrueCondition || kind === FlowNodeKind.FalseCondition;
}

/**
 * Check if a flow node kind changes control flow
 */
export function isFlowChangingNode(kind: FlowNodeKind): boolean {
    return kind === FlowNodeKind.Break || kind === FlowNodeKind.Return;
}

// =============================================================================
// FLOW BINDER
// =============================================================================

/**
 * Builds the flow graph during AST traversal
 * Port of EmmyLua's FlowBinder
 */
export class FlowBinder {
    private nodes: FlowNode[] = [];
    private multipleAntecedents: FlowId[][] = [];
    private bindings: Map<number, FlowId> = new Map();

    /** Flow ID for start node */
    readonly start: FlowId;
    /** Flow ID for unreachable node */
    readonly unreachable: FlowId;
    /** Current loop label (for break statements) */
    loopLabel: FlowId;
    /** Target for break statements */
    breakTargetLabel: FlowId;
    /** Target for truthy conditions */
    trueTarget: FlowId;
    /** Target for falsy conditions */
    falseTarget: FlowId;

    constructor() {
        // Create initial nodes
        this.start = this.createNode(FlowNodeKind.Start);
        this.unreachable = this.createNode(FlowNodeKind.Unreachable);

        // Initialize labels to unreachable
        this.loopLabel = this.unreachable;
        this.breakTargetLabel = this.unreachable;
        this.trueTarget = this.unreachable;
        this.falseTarget = this.unreachable;
    }

    /**
     * Create a new flow node with the given kind
     */
    createNode(kind: FlowNodeKind, data?: FlowNodeData): FlowId {
        const id = this.nodes.length;
        this.nodes.push({ id, kind, data });
        return id;
    }

    /**
     * Create a branch label node
     */
    createBranchLabel(): FlowId {
        return this.createNode(FlowNodeKind.BranchLabel);
    }

    /**
     * Create a loop label node
     */
    createLoopLabel(): FlowId {
        return this.createNode(FlowNodeKind.LoopLabel);
    }

    /**
     * Create a declaration position node
     */
    createDecl(offset: number): FlowId {
        return this.createNode(FlowNodeKind.DeclPosition, {
            kind: "decl_position",
            offset,
        });
    }

    /**
     * Create a return node
     */
    createReturn(): FlowId {
        return this.createNode(FlowNodeKind.Return);
    }

    /**
     * Create a break node
     */
    createBreak(): FlowId {
        return this.createNode(FlowNodeKind.Break);
    }

    /**
     * Create a TrueCondition node for truthy branch
     */
    createTrueCondition(conditionNode: LuaNode): FlowId {
        return this.createNode(FlowNodeKind.TrueCondition, {
            kind: "condition",
            node: conditionNode,
        });
    }

    /**
     * Create a FalseCondition node for falsy branch
     */
    createFalseCondition(conditionNode: LuaNode): FlowId {
        return this.createNode(FlowNodeKind.FalseCondition, {
            kind: "condition",
            node: conditionNode,
        });
    }

    /**
     * Create an assignment node
     */
    createAssignment(assignNode: LuaNode): FlowId {
        return this.createNode(FlowNodeKind.Assignment, {
            kind: "assignment",
            node: assignNode,
        });
    }

    /**
     * Add an antecedent (predecessor) to a flow node
     * Port of EmmyLua's add_antecedent
     */
    addAntecedent(nodeId: FlowId, antecedent: FlowId): void {
        // Don't add if either is unreachable
        if (antecedent === this.unreachable || nodeId === this.unreachable) {
            return;
        }

        const node = this.nodes[nodeId];
        if (!node) return;

        if (!node.antecedent) {
            // First antecedent - set as single
            node.antecedent = { kind: "single", id: antecedent };
        } else if (node.antecedent.kind === "single") {
            // Already has one - convert to multiple
            if (node.antecedent.id === antecedent) return; // Same, skip

            const index = this.multipleAntecedents.length;
            this.multipleAntecedents.push([node.antecedent.id, antecedent]);
            node.antecedent = { kind: "multiple", index };
        } else {
            // Already multiple - add to list
            const list = this.multipleAntecedents[node.antecedent.index];
            if (list && !list.includes(antecedent)) {
                list.push(antecedent);
            }
        }
    }

    /**
     * Bind an AST offset to a flow ID
     */
    bindOffset(offset: number, flowId: FlowId): void {
        this.bindings.set(offset, flowId);
    }

    /**
     * Get the flow node by ID
     */
    getFlow(flowId: FlowId): FlowNode | undefined {
        return this.nodes[flowId];
    }

    /**
     * Check if a flow node is unreachable
     */
    isUnreachable(flowId: FlowId): boolean {
        const node = this.nodes[flowId];
        return node?.kind === FlowNodeKind.Unreachable;
    }

    /**
     * Finish binding and return the completed FlowTree
     */
    finish(): FlowTree {
        const tree = new FlowTree();

        // Copy nodes
        for (const node of this.nodes) {
            tree.addNode(node.kind, node.antecedent, node.data);
        }

        // Copy bindings
        for (const [offset, flowId] of this.bindings) {
            tree.bindOffset(offset, flowId);
        }

        // Copy multiple antecedents
        for (const ids of this.multipleAntecedents) {
            tree.addMultipleAntecedents([...ids]);
        }

        return tree;
    }
}

/**
 * Finish a flow label by adding antecedent if not unreachable
 * Port of EmmyLua's finish_flow_label
 */
export function finishFlowLabel(
    binder: FlowBinder,
    label: FlowId,
    current: FlowId
): FlowId {
    if (binder.isUnreachable(label)) {
        return current;
    }

    binder.addAntecedent(label, current);
    return label;
}
