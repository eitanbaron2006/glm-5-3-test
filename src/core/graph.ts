import { Heightmap } from './heightmap';

export interface NodePortDef {
  id: string;
  label: string;
}

export type ParamType = 'number' | 'slider' | 'seed' | 'select' | 'check';

export interface ParamDef {
  id: string;
  label: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: Array<{ value: string; label: string }>;
  integer?: boolean;
}

export interface EvalContext {
  size: number;
}

export interface ComputeResult {
  height: Heightmap;
}

export interface NodeTypeDefinition {
  type: string;
  title: string;
  category: string;
  color: string;
  inputs: NodePortDef[];
  outputs: NodePortDef[];
  params: ParamDef[];
  compute(
    inputs: Record<string, Heightmap | undefined>,
    params: Record<string, any>,
    ctx: EvalContext
  ): Heightmap;
}

export interface GraphNode {
  id: string;
  type: string;
  x: number;
  y: number;
  params: Record<string, any>;
  /** GAEA-style bypass: when false the node passes its input through unchanged. */
  enabled?: boolean;
}

export interface GraphEdge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export class Graph {
  nodes = new Map<string, GraphNode>();
  edges: GraphEdge[] = [];
  version = 0;

  addNode(node: GraphNode) {
    this.nodes.set(node.id, node);
    this.version++;
  }

  removeNode(id: string) {
    this.nodes.delete(id);
    this.edges = this.edges.filter(e => e.fromNode !== id && e.toNode !== id);
    this.version++;
  }

  addEdge(edge: GraphEdge): boolean {
    // no self loops
    if (edge.fromNode === edge.toNode) return false;
    // prevent cycles: adding from->to is a cycle iff a path to->...->from already exists
    if (this.wouldCreateCycle(edge.fromNode, edge.toNode)) return false;
    // replace existing edge into the same input port
    this.edges = this.edges.filter(
      e => !(e.toNode === edge.toNode && e.toPort === edge.toPort)
    );
    this.edges.push(edge);
    this.version++;
    return true;
  }

  removeEdge(id: string) {
    this.edges = this.edges.filter(e => e.id !== id);
    this.version++;
  }

  private wouldCreateCycle(from: string, to: string): boolean {
    // walk downstream from `to`; if we reach `from`, a cycle would form
    const seen = new Set<string>();
    const stack = [to];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === from) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const e of this.edges) {
        if (e.fromNode === n) stack.push(e.toNode);
      }
    }
    return false;
  }

  /** Input heightmaps feeding a given node. */
  inputsOf(nodeId: string): Record<string, Heightmap | undefined> {
    const result: Record<string, Heightmap | undefined> = {};
    for (const e of this.edges) {
      if (e.toNode === nodeId) result[e.toPort] = this.nodeResult?.get(e.fromNode);
    }
    return result;
  }

  nodeResult: Map<string, Heightmap> | null = null;

  /** Topological order of nodes reachable into `roots` (or all nodes if roots omitted). */
  topoOrder(roots?: string[]): string[] {
    const order: string[] = [];
    const state = new Map<string, 0 | 1 | 2>(); // unvisited / in-progress / done
    const visit = (id: string) => {
      const st = state.get(id);
      if (st === 1 || st === 2) return;
      state.set(id, 1);
      for (const e of this.edges) {
        if (e.toNode === id) visit(e.fromNode);
      }
      state.set(id, 2);
      order.push(id);
    };
    if (roots && roots.length) {
      for (const r of roots) {
        if (this.nodes.has(r)) visit(r);
      }
    } else {
      for (const id of this.nodes.keys()) visit(id);
    }
    return order;
  }

  serialize() {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges
    };
  }

  static deserialize(data: { nodes: GraphNode[]; edges: GraphEdge[] }): Graph {
    const g = new Graph();
    for (const n of data.nodes) g.addNode({ ...n });
    g.edges = [];
    for (const e of data.edges) g.edges.push({ ...e });
    return g;
  }
}
