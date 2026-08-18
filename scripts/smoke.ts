/* Smoke test: evaluates every preset graph headlessly and prints stats. */
import { Graph, GraphNode } from '../src/core/graph';
import { GraphEngine } from '../src/core/engine';
import { Heightmap } from '../src/core/heightmap';
import { PRESETS } from '../src/presets';
import { NODE_TYPES } from '../src/nodes/registry';

function buildPreset(index: number): { engine: GraphEngine; outNode: GraphNode } {
  const preset = PRESETS[index];
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
  const outNode = map.get('out')!;
  return { engine, outNode };
}

function stats(h: Heightmap) {
  let sum = 0;
  for (let i = 0; i < h.data.length; i++) sum += h.data[i];
  return `min=${h.min().toFixed(3)} max=${h.max().toFixed(3)} mean=${(sum / h.data.length).toFixed(3)}`;
}

const size = parseInt(process.argv[2] ?? '256');
let failed = false;

for (let i = 0; i < PRESETS.length; i++) {
  const { engine, outNode } = buildPreset(i);
  const t0 = Date.now();
  const results = engine.evaluate(size);
  const h = results.get(outNode.id);
  const ms = Date.now() - t0;
  if (!h) {
    console.error(`FAIL ${PRESETS[i].name}: no output result`);
    failed = true;
    continue;
  }
  const ok = h.size === size && isFinite(h.min()) && isFinite(h.max());
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${PRESETS[i].name.padEnd(18)} ${String(size) + '²'} ${String(ms).padStart(5)}ms  ${stats(h)}`);
  if (!ok) failed = true;
}

// primitive nodes check
{
  const prims = NODE_TYPES.filter(n => n.category === 'Primitives');
  for (const def of prims) {
    const g = new Graph();
    const engine = new GraphEngine(g);
    const node = engine.createNode(def.type, 0, 0);
    const out = engine.createNode('output', 200, 0);
    engine.connect(node.id, 'out', out.id, 'in');
    const results = engine.evaluate(size);
    const h = results.get(out.id);
    if (!h) {
      console.error(`FAIL primitive ${def.type}: no output result`);
      failed = true;
      continue;
    }
    let nan = 0;
    for (let i = 0; i < h.data.length; i++) if (!isFinite(h.data[i])) nan++;
    const mn = h.min(), mx = h.max();
    const ok = nan === 0 && mn >= -1e-6 && mx <= 1 + 1e-6 && mx > mn;
    console.log(`${ok ? 'OK  ' : 'FAIL'} primitive ${def.title.padEnd(10)} ${stats(h)}${nan ? ` NaN=${nan}` : ''}`);
    if (!ok) failed = true;
  }

  // Check all 4 original mountain styles explicitly
  const styles = ['alpine', 'massif', 'spined', 'craggy'];
  for (const st of styles) {
    const g = new Graph();
    const engine = new GraphEngine(g);
    const node = engine.createNode('mountain', 0, 0);
    node.params.style = st;
    const out = engine.createNode('output', 200, 0);
    engine.connect(node.id, 'out', out.id, 'in');
    const results = engine.evaluate(size);
    const h = results.get(out.id);
    if (!h) {
      console.error(`FAIL mountain style ${st}: no output`);
      failed = true;
      continue;
    }
    let nan = 0;
    for (let i = 0; i < h.data.length; i++) if (!isFinite(h.data[i])) nan++;
    const mn = h.min(), mx = h.max();
    const ok = nan === 0 && mn >= -1e-6 && mx <= 1 + 1e-6 && mx > mn;
    console.log(`${ok ? 'OK  ' : 'FAIL'} mountain style: ${st.padEnd(12)} ${stats(h)}${nan ? ` NaN=${nan}` : ''}`);
    if (!ok) failed = true;
  }

  // Check all 5 GAEA mountain V2 styles explicitly
  const v2Styles = ['basic', 'eroded', 'old', 'alpine', 'strata'];
  for (const st of v2Styles) {
    const g = new Graph();
    const engine = new GraphEngine(g);
    const node = engine.createNode('mountainV2', 0, 0);
    node.params.style = st;
    const out = engine.createNode('output', 200, 0);
    engine.connect(node.id, 'out', out.id, 'in');
    const results = engine.evaluate(size);
    const h = results.get(out.id);
    if (!h) {
      console.error(`FAIL mountainV2 style ${st}: no output`);
      failed = true;
      continue;
    }
    let nan = 0;
    for (let i = 0; i < h.data.length; i++) if (!isFinite(h.data[i])) nan++;
    const mn = h.min(), mx = h.max();
    const ok = nan === 0 && mn >= -1e-6 && mx <= 1 + 1e-6 && mx > mn;
    console.log(`${ok ? 'OK  ' : 'FAIL'} mountainV2 style: ${st.padEnd(12)} ${stats(h)}${nan ? ` NaN=${nan}` : ''}`);
    if (!ok) failed = true;
  }
}

// cycle prevention check
{
  const g = new Graph();
  const engine = new GraphEngine(g);
  const a = engine.createNode('constant', 0, 0);
  const b = engine.createNode('blur', 200, 0);
  engine.connect(a.id, 'out', b.id, 'in');
  const cycle = engine.connect(b.id, 'out', a.id, 'in');
  console.log(cycle === null ? 'OK   cycle prevention works' : 'FAIL cycle prevention broken');
  if (cycle !== null) failed = true;
}

process.exit(failed ? 1 : 0);
