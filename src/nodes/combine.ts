import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize } from './generators';

const COM = '#683884';

export const BlendNode: NodeTypeDefinition = {
  type: 'blend',
  title: 'Blend',
  category: 'Combiners',
  color: COM,
  inputs: [
    { id: 'a', label: 'Base' },
    { id: 'b', label: 'Blend' },
    { id: 'mask', label: 'Mask (opt)' },
  ],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    {
      id: 'mode', label: 'Mode', type: 'select', default: 'mix',
      options: [
        { value: 'mix', label: 'Mix' },
        { value: 'add', label: 'Add' },
        { value: 'subtract', label: 'Subtract' },
        { value: 'multiply', label: 'Multiply' },
        { value: 'min', label: 'Min (Darken)' },
        { value: 'max', label: 'Max (Lighten)' },
        { value: 'screen', label: 'Screen' },
        { value: 'overlay', label: 'Overlay' },
      ]
    },
    { id: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  compute(inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const a = inputs.a ?? new Heightmap(s).fill(0);
    const b = inputs.b ?? new Heightmap(s).fill(0);
    const mask = inputs.mask;
    const out = new Heightmap(s);
    const mode = p.mode as string;

    for (let i = 0; i < s * s; i++) {
      const av = a.data[i] ?? 0;
      const bv = b.data[i] ?? 0;
      let v: number;
      switch (mode) {
        case 'add': v = av + bv; break;
        case 'subtract': v = av - bv; break;
        case 'multiply': v = av * bv; break;
        case 'min': v = Math.min(av, bv); break;
        case 'max': v = Math.max(av, bv); break;
        case 'screen': v = 1 - (1 - av) * (1 - bv); break;
        case 'overlay':
          v = av < 0.5 ? 2 * av * bv : 1 - 2 * (1 - av) * (1 - bv);
          break;
        default: v = av * (1 - p.opacity) + bv * p.opacity;
      }
      if (mode !== 'mix' && p.opacity !== 1) v = av * (1 - p.opacity) + v * p.opacity;
      if (mask) {
        const m = mask.data[i] ?? 0;
        v = av * (1 - m) + v * m;
      }
      out.data[i] = Math.min(Math.max(v, 0), 1);
    }
    return out;
  }
};

export const DisplaceNode: NodeTypeDefinition = {
  type: 'displace',
  title: 'Displace',
  category: 'Combiners',
  color: COM,
  inputs: [
    { id: 'in', label: 'In' },
    { id: 'map', label: 'Displacement Map' },
  ],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'strength', label: 'Strength', type: 'slider', min: 0, max: 0.5, step: 0.005, default: 0.05 },
    { id: 'axis', label: 'Axis', type: 'select', default: 'both', options: [
      { value: 'both', label: 'XY (both)' },
      { value: 'x', label: 'X only' },
      { value: 'y', label: 'Y only' },
    ] },
  ],
  compute(inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const src = inputs.in ?? new Heightmap(s).fill(0.5);
    const map = inputs.map ?? new Heightmap(s).fill(0.5);
    const out = new Heightmap(s);
    const st = p.strength;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const d = map.get(x, y) - 0.5;
        const du = p.axis === 'y' ? 0 : d * st;
        const dv = p.axis === 'x' ? 0 : d * st;
        out.set(x, y, src.sample(u + du, v + dv));
      }
    }
    return out;
  }
};
