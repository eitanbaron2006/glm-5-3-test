/* Probe: render a single node (or preset chain) as ASCII art for visual sanity. */
import { Graph, GraphNode } from '../src/core/graph';
import { GraphEngine } from '../src/core/engine';
import { Heightmap } from '../src/core/heightmap';
import { PRESETS } from '../src/presets';

function ascii(h: Heightmap, w = 96, ht = 36) {
  const chars = ' .:-=+*#%@';
  let out = '';
  for (let y = 0; y < ht; y++) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const u = Math.floor((x / (w - 1)) * (h.size - 1));
      const v = Math.floor((y / (ht - 1)) * (h.size - 1));
      const val = h.get(u, v);
      line += chars[Math.min(chars.length - 1, Math.max(0, Math.floor(val * chars.length)))];
    }
    out += line + '\n';
  }
  return out;
}

const size = parseInt(process.argv[2] ?? '128');
const presetIdx = parseInt(process.argv[3] ?? '0');
const stage = process.argv[4] ?? 'out'; // node key to print

const preset = PRESETS[presetIdx];
const g = new Graph();
const engine = new GraphEngine(g);
const map = new Map<string, GraphNode>();
for (const spec of preset.nodes) {
  const n = engine.createNode(spec.type, spec.x, spec.y);
  if (spec.params) Object.assign(n.params, spec.params);
  map.set(spec.key, n);
}
for (const link of preset.links) {
  const from = map.get(link.from)!;
  const to = map.get(link.to)!;
  g.addEdge({
    id: `e_${link.from}_${link.to}`,
    fromNode: from.id, fromPort: link.fromPort ?? 'out',
    toNode: to.id, toPort: link.toPort ?? 'in'
  });
}
const results = engine.evaluate(size);
const node = map.get(stage)!;
const h = results.get(node.id)!;
let sum = 0;
for (let i = 0; i < h.data.length; i++) sum += h.data[i];
console.log(`preset "${preset.name}" stage "${stage}" ${size}²  min=${h.min().toFixed(3)} max=${h.max().toFixed(3)} mean=${(sum / h.data.length).toFixed(3)}`);
console.log(ascii(h));
