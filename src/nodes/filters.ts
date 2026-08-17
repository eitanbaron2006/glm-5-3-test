import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize, boxBlur } from './generators';

const FLT = '#2d568c';

export const BlurNode: NodeTypeDefinition = {
  type: 'blur',
  title: 'Blur',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [{ id: 'radius', label: 'Radius', type: 'slider', min: 0, max: 32, step: 1, default: 4, integer: true }],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    return boxBlur(src, p.radius * (src.size / 256));
  }
};

export const SharpenNode: NodeTypeDefinition = {
  type: 'sharpen',
  title: 'Sharpen',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [{ id: 'amount', label: 'Amount', type: 'slider', min: 0, max: 4, step: 0.05, default: 1 }],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const blurred = boxBlur(src, Math.max(1, src.size / 96));
    const out = new Heightmap(src.size);
    const a = p.amount;
    for (let i = 0; i < src.data.length; i++) {
      out.data[i] = Math.min(Math.max(src.data[i] + (src.data[i] - blurred.data[i]) * a, 0), 1);
    }
    return out;
  }
};

export const AdjustNode: NodeTypeDefinition = {
  type: 'adjust',
  title: 'Adjust',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'brightness', label: 'Brightness', type: 'slider', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { id: 'contrast', label: 'Contrast', type: 'slider', min: -1, max: 2, step: 0.01, default: 0 },
    { id: 'gamma', label: 'Gamma', type: 'slider', min: 0.1, max: 4, step: 0.05, default: 1 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out = new Heightmap(src.size);
    const c = p.contrast;
    const k = c >= 0 ? 1 + c * 2 : 1 + c;
    const invG = 1 / Math.max(p.gamma, 0.01);
    for (let i = 0; i < src.data.length; i++) {
      let v = src.data[i] + p.brightness;
      v = (v - 0.5) * k + 0.5;
      v = Math.min(Math.max(v, 0), 1);
      out.data[i] = Math.pow(v, invG);
    }
    return out;
  }
};

export const RemapNode: NodeTypeDefinition = {
  type: 'remap',
  title: 'Remap',
  category: 'Filters',
  color: FLT,
  inputs: [{ id: 'in', label: 'In' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'inMin', label: 'In Low', type: 'slider', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'inMax', label: 'In High', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
    { id: 'outMin', label: 'Out Low', type: 'slider', min: 0, max: 1, step: 0.01, default: 0 },
    { id: 'outMax', label: 'Out High', type: 'slider', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const out = new Heightmap(src.size);
    const r = p.inMax - p.inMin;
    const inv = Math.abs(r) < 1e-6 ? 0 : 1 / r;
    for (let i = 0; i < src.data.length; i++) {
      const t = Math.min(Math.max((src.data[i] - p.inMin) * inv, 0), 1);
      out.data[i] = p.outMin + (p.outMax - p.outMin) * t;
    }
    return out;
  }
};
