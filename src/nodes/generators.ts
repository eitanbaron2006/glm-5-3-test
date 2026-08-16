import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';

const GEN = '#e8963c';

export function makeSize(size: number): number {
  return Math.max(16, Math.min(8192, Math.round(size)));
}

export const GradientNode: NodeTypeDefinition = {
  type: 'gradient',
  title: 'Gradient',
  category: 'Generators',
  color: GEN,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'angle', label: 'Angle', type: 'slider', min: 0, max: 360, step: 1, default: 0 },
    { id: 'start', label: 'Start Value', type: 'slider', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'end', label: 'End Value', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const rad = (p.angle * Math.PI) / 180;
    const dx = Math.sin(rad), dy = -Math.cos(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
        const t = (u * dx + v * dy) / 2 + 0.5;
        h.set(x, y, p.start + (p.end - p.start) * Math.min(Math.max(t, 0), 1));
      }
    }
    return h;
  }
};

export const RadialGradientNode: NodeTypeDefinition = {
  type: 'radial',
  title: 'Radial Gradient',
  category: 'Generators',
  color: GEN,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'falloff', label: 'Falloff', type: 'slider', min: 0.1, max: 4, step: 0.05, default: 1.6 },
    { id: 'peak', label: 'Peak', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
        const d = Math.sqrt(u * u + v * v) / Math.SQRT2;
        h.set(x, y, Math.max(0, p.peak * (1 - Math.pow(d, p.falloff))));
      }
    }
    return h;
  }
};

export const ConstantNode: NodeTypeDefinition = {
  type: 'constant',
  title: 'Constant',
  category: 'Generators',
  color: GEN,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'value', label: 'Value', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  compute(_inputs, p, ctx) {
    const h = new Heightmap(makeSize(ctx.size));
    h.fill(p.value);
    return h;
  }
};

/** Simple separable box blur used by several nodes. */
export function boxBlur(src: Heightmap, radius: number): Heightmap {
  const s = src.size;
  const tmp = new Float32Array(s * s);
  const out = new Heightmap(s);
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return src.clone();

  // horizontal pass
  for (let y = 0; y < s; y++) {
    let acc = 0;
    const row = y * s;
    for (let x = -r; x <= r; x++) acc += src.data[row + Math.min(s - 1, Math.max(0, x))];
    const w = 2 * r + 1;
    for (let x = 0; x < s; x++) {
      tmp[row + x] = acc / w;
      const add = src.data[row + Math.min(s - 1, x + r + 1)];
      const sub = src.data[row + Math.max(0, x - r)];
      acc += add - sub;
    }
  }
  // vertical pass
  for (let x = 0; x < s; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(s - 1, Math.max(0, y)) * s + x];
    const w = 2 * r + 1;
    for (let y = 0; y < s; y++) {
      out.data[y * s + x] = acc / w;
      const add = tmp[Math.min(s - 1, y + r + 1) * s + x];
      const sub = tmp[Math.max(0, y - r) * s + x];
      acc += add - sub;
    }
  }
  return out;
}
