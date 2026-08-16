import { Graph, GraphEdge, GraphNode, NodeTypeDefinition } from './graph';
import { Heightmap } from './heightmap';
import { NODE_TYPES } from '../nodes/registry';

let idCounter = 0;
export function uid(prefix: string): string {
  idCounter++;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export interface EvalOptions {
  size: number;
  onNodeDone?: (nodeId: string, height: Heightmap) => void;
}

export class GraphEngine {
  graph: Graph;
  registry = new Map<string, NodeTypeDefinition>();
  cache = new Map<string, Heightmap>();

  constructor(graph: Graph) {
    this.graph = graph;
    for (const def of NODE_TYPES) this.registry.set(def.type, def);
  }

  defaultsFor(type: string): Record<string, any> {
    const def = this.registry.get(type);
    const params: Record<string, any> = {};
    if (def) for (const p of def.params) params[p.id] = p.default;
    return params;
  }

  createNode(type: string, x: number, y: number): GraphNode {
    const node: GraphNode = {
      id: uid(type),
      type,
      x,
      y,
      enabled: true,
      params: this.defaultsFor(type)
    };
    this.graph.addNode(node);
    return node;
  }

  connect(fromNode: string, fromPort: string, toNode: string, toPort: string): GraphEdge | null {
    const edge: GraphEdge = { id: uid('e'), fromNode, fromPort, toNode, toPort };
    if (this.graph.addEdge(edge)) return edge;
    return null;
  }

  /** Evaluate the graph up to every node; stores results in graph.nodeResult + cache. */
  evaluate(size: number, onNodeDone?: (id: string, h: Heightmap) => void) {
    const order = this.graph.topoOrder();
    const results = new Map<string, Heightmap>();
    this.cache = results;
    this.graph.nodeResult = results;

    for (const id of order) {
      const node = this.graph.nodes.get(id);
      if (!node) continue;
      const def = this.registry.get(node.type);
      if (!def) continue;

      const inputs: Record<string, Heightmap | undefined> = {};
      for (const e of this.graph.edges) {
        if (e.toNode === id) inputs[e.toPort] = results.get(e.fromNode);
      }

      // GAEA-style bypass: disabled nodes pass their main input through.
      if (node.enabled === false) {
        const pass = inputs.in ?? inputs.a ?? inputs.b;
        const h = pass ? pass.clone() : new Heightmap(size);
        results.set(id, h);
        onNodeDone?.(id, h);
        continue;
      }

      try {
        const h = def.compute(inputs, node.params, { size });
        // Shared per-node "Height" param: any node exposing it (all primitives)
        // gets its output scaled here, so individual elements can be taller or
        // shorter than others BEFORE they are blended together.
        const nodeHeight = (node.params as Record<string, unknown>).height;
        if (typeof nodeHeight === 'number' && nodeHeight !== 1) {
          const k = Math.max(0, nodeHeight);
          for (let i = 0; i < h.data.length; i++) h.data[i] *= k;
        }
        if (h.size !== size) {
          // safety: resample if node produced wrong size
          const r = new Heightmap(size);
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              r.set(x, y, h.sample(x / (size - 1), y / (size - 1)));
            }
          }
          results.set(id, r);
          onNodeDone?.(id, r);
        } else {
          results.set(id, h);
          onNodeDone?.(id, h);
        }
      } catch (err) {
        console.error(`Node ${def.title} (${id}) failed:`, err);
        const fallback = new Heightmap(size);
        results.set(id, fallback);
        onNodeDone?.(id, fallback);
      }
    }
    return results;
  }
}
