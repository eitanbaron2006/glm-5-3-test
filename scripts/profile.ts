/* Dev check: how non-circular is the Mountain base contour, and does the
   per-node Height param scale output through the engine? */
import { Graph } from '../src/core/graph';
import { GraphEngine } from '../src/core/engine';
import { MountainNode } from '../src/nodes/primitives';

// ---- 1. contour roundness at default params ----
const node: any = MountainNode;
const p: Record<string, number> = {};
for (const prm of node.params) p[prm.id] = prm.default;
const h = node.compute([], p, { size: 256 });
const thr = 0.3;
const radii: number[] = [];
for (let a = 0; a < 16; a++) {
  const th = (a / 16) * Math.PI * 2;
  const dx = Math.cos(th), dy = Math.sin(th);
  let r = 0;
  while (r < 127) {
    const x = Math.round(128 + dx * r), y = Math.round(128 + dy * r);
    if (x < 0 || y < 0 || x > 255 || y > 255 || h.get(x, y) < thr) break;
    r++;
  }
  radii.push(r);
}
const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
const sd = Math.sqrt(radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length);
console.log('contour radii @16 angles:', radii.join(','));
console.log(`roundness: mean=${mean.toFixed(1)}px  stddev=${(sd / mean * 100).toFixed(0)}% (0% = perfect circle)`);

// ---- 2. per-node Height through the engine ----
const g = new Graph();
const eng = new GraphEngine(g);
const m = eng.createNode('mountain', 0, 0);
const out = eng.createNode('output', 200, 0);
g.addEdge({ id: 'e1', fromNode: m.id, fromPort: 'out', toNode: out.id, toPort: 'in' });
eng.evaluate(128);
const full = eng.cache.get(out.id)!.max();
m.params.height = 0.5;
eng.evaluate(128);
const half = eng.cache.get(out.id)!.max();
console.log(`engine Height param: default max=${full.toFixed(3)}, height=0.5 max=${half.toFixed(3)} (expect ~${(full * 0.5).toFixed(3)})`);
