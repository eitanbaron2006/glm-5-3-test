import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize } from './generators';

const FLT = '#2d568c';

export const ClampNode: NodeTypeDefinition = {
  type: 'clamp',
  title: 'Clamp',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'min', label: 'Min', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.1 },
    { id: 'max', label: 'Max', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.9 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out = new Heightmap(src.size);
    for (let i = 0; i < src.data.length; i++) {
      out.data[i] = Math.min(Math.max(src.data[i], p.min), p.max);
    }
    return out;
  }
};

export const InvertNode: NodeTypeDefinition = {
  type: 'invert',
  title: 'Invert',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [],
  compute(inputs, _p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out = new Heightmap(src.size);
    for (let i = 0; i < src.data.length; i++) out.data[i] = 1 - src.data[i];
    return out;
  }
};

export const TerraceNode: NodeTypeDefinition = {
  type: 'terrace',
  title: 'Terrace',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'steps', label: 'Steps', type: 'slider', min: 2, max: 32, step: 1, default: 8, integer: true },
    { id: 'smoothness', label: 'Smoothness', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out = new Heightmap(src.size);
    const n = p.steps;
    for (let i = 0; i < src.data.length; i++) {
      const v = src.data[i] * n;
      const f = Math.floor(v);
      let frac = v - f;
      const sm = p.smoothness;
      frac = frac * frac * (3 - 2 * frac) * sm + frac * (1 - sm);
      out.data[i] = (f + frac) / n;
    }
    return out;
  }
};

export const SlopeNode: NodeTypeDefinition = {
  type: 'slope',
  title: 'Slope',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'intensity', label: 'Intensity', type: 'slider', min: 0.1, max: 8, step: 0.1, default: 2 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0);
    const s = src.size;
    const out = new Heightmap(s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const xm = Math.max(0, x - 1), xp = Math.min(s - 1, x + 1);
        const ym = Math.max(0, y - 1), yp = Math.min(s - 1, y + 1);
        const dx = (src.get(xp, y) - src.get(xm, y)) * 0.5;
        const dy = (src.get(x, yp) - src.get(x, ym)) * 0.5;
        const g = Math.sqrt(dx * dx + dy * dy) * p.intensity;
        out.set(x, y, Math.min(g, 1));
      }
    }
    return out;
  }
};
