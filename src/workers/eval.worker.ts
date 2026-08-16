/* Graph evaluation worker: keeps heavy terrain builds (4K/8K, erosion)
   off the main thread so the UI never freezes — like GAEA's threaded engine.

   Protocol (main -> worker):  { type: 'eval', evalId, graph, size }
   Protocol (worker -> main):  { type: 'node', evalId, id, size, data, setmap? }
                               { type: 'done', evalId, ms }
                               { type: 'error', evalId, message } */
import { Graph } from '../core/graph';
import { GraphEngine } from '../core/engine';

/** Minimal typed alias so this file compiles under the DOM lib too. */
const ctx = self as unknown as {
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

ctx.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as { type?: string; evalId?: number; graph?: ReturnType<Graph['serialize']>; size?: number };
  if (msg?.type !== 'eval' || !msg.graph || !msg.size) return;
  const { evalId, graph, size } = msg;
  try {
    const g = Graph.deserialize(graph);
    const engine = new GraphEngine(g);
    const t0 = performance.now();
    engine.evaluate(size, (_id, h) => {
      // copy (not transfer) the live buffer: downstream nodes still read it
      const copy = h.data.slice();
      // Also send setmap / smartmap if present
      const setmap = (h as any).setmap;
      const smartmap = (h as any).smartmap;
      ctx.postMessage({ type: 'node', evalId, id: _id, size: h.size, data: copy, setmap, smartmap }, [copy.buffer]);
    });
    ctx.postMessage({ type: 'done', evalId, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    ctx.postMessage({ type: 'error', evalId, message: String(err) });
  }
});
