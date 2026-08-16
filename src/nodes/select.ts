import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize } from './generators';

const SEL = '#d84f5f';

/** Trapezoid falloff: 1 inside [pos-half, pos+half], smooth to 0 at ±range. */
function falloff(v: number, pos: number, half: number, range: number): number {
  const d = Math.abs(v - pos);
  if (d <= half) return 1;
  const t = (d - half) / Math.max(range, 1e-6);
  return t >= 1 ? 0 : 1 - t * t * (3 - 2 * t); // smoothstep down
}

export const SelectRangeNode: NodeTypeDefinition = {
  type: 'selectrange',
  title: 'Select Range',
  category: 'Selectors',
  color: SEL,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Mask' }],
  params: [
    { id: 'position', label: 'Position', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'range', label: 'Range', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'falloff', label: 'Falloff', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.3 },
    { id: 'invert', label: 'Invert', type: 'check', default: false },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out = new Heightmap(src.size);
    const half = p.range * (1 - p.falloff) * 0.5;
    for (let i = 0; i < src.data.length; i++) {
      let m = falloff(src.data[i], p.position, half, p.range * p.falloff * 0.5 + 1e-6);
      if (p.invert) m = 1 - m;
      out.data[i] = m;
    }
    return out;
  }
};

export const OutputNode: NodeTypeDefinition = {
  type: 'output',
  title: 'Output',
  category: 'Output',
  color: '#8fbf4d',
  inputs: [{ id: 'in', label: 'Terrain' }],
  outputs: [],
  params: [],
  compute(inputs, _p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0);
    return src;
  }
};
