import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { FBM, NoiseType, voronoi, VoronoiFeature } from '../core/noise';
import { makeSize, boxBlur } from './generators';

const GEN = '#9c5c16';

export const NoiseNode: NodeTypeDefinition = {
  type: 'noise',
  title: 'Fractal Noise',
  category: 'Generators',
  color: GEN,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 1337 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    {
      id: 'type', label: 'Type', type: 'select', default: 'perlin',
      options: [
        { value: 'perlin', label: 'Perlin' },
        { value: 'billow', label: 'Billow' },
        { value: 'ridged', label: 'Ridged' },
        { value: 'wire', label: 'Wire (Sharp)' },
        { value: 'classicfbm', label: 'Classic FBM' },
      ]
    },
    { id: 'scale', label: 'Feature Scale', type: 'slider', min: 0.5, max: 24, step: 0.1, default: 3 },
    { id: 'octaves', label: 'Octaves', type: 'slider', min: 1, max: 12, step: 1, default: 8, integer: true },
    { id: 'lacunarity', label: 'Lacunarity', type: 'slider', min: 1.5, max: 3.5, step: 0.05, default: 2 },
    { id: 'gain', label: 'Roughness', type: 'slider', min: 0.2, max: 0.75, step: 0.01, default: 0.5 },
    { id: 'warp', label: 'Domain Warp', type: 'slider', min: 0, max: 1.5, step: 0.02, default: 0.35 },
    { id: 'warpScale', label: 'Warp Scale', type: 'slider', min: 0.5, max: 12, step: 0.05, default: 2 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, p.octaves, p.lacunarity, p.gain, p.type as NoiseType);
    const warpFBM = p.warp > 0.001
      ? new FBM(p.seed + 999, p.octaves, p.lacunarity, p.gain, 'perlin')
      : null;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        let nx = (u + (p.x - 0.5)) * p.scale, ny = (v + (p.y - 0.5)) * p.scale;
        if (warpFBM) {
          const wx = warpFBM.sample(nx * p.warpScale + 31.4, ny * p.warpScale);
          const wy = warpFBM.sample(nx * p.warpScale - 47.2, ny * p.warpScale + 12.9);
          nx += wx * p.warp;
          ny += wy * p.warp;
        }
        h.set(x, y, fbm.sample(nx, ny));
      }
    }
    return h.normalize();
  }
};

export const VoronoiNode: NodeTypeDefinition = {
  type: 'voronoi',
  title: 'Voronoi',
  category: 'Generators',
  color: GEN,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 42 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    {
      id: 'feature', label: 'Feature', type: 'select', default: 'f1',
      options: [
        { value: 'f1', label: 'F1 Distance' },
        { value: 'f2', label: 'F2 Distance' },
        { value: 'f2minusf1', label: 'F2 - F1 (Borders)' },
        { value: 'cellular', label: 'Cellular' },
      ]
    },
    { id: 'frequency', label: 'Frequency', type: 'slider', min: 2, max: 64, step: 1, default: 16, integer: true },
    { id: 'smooth', label: 'Smooth Blending', type: 'slider', min: 0, max: 1, step: 0.01, default: 0 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const feat = p.feature as VoronoiFeature;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        h.set(x, y, voronoi(x / (s - 1) + (p.x - 0.5), y / (s - 1) + (p.y - 0.5), p.frequency, p.seed, feat));
      }
    }
    if (p.smooth > 0.01) {
      const blurred = boxBlur(h, Math.max(1, Math.round(s / 48)));
      const t = p.smooth;
      for (let i = 0; i < h.data.length; i++) {
        h.data[i] = h.data[i] * (1 - t) + blurred.data[i] * t;
      }
    }
    return h.normalize();
  }
};
