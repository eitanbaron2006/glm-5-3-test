/* GAEA-style primitive terrain shapes.

   DESIGN RULE (GAEA-like): every primitive emits exactly ONE feature —
   one mountain, one island, one ridge, one peak. Multi-feature terrain
   is composed by combining multiple nodes in the graph (Blend/Add). */
import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { FBM, mulberry32, PerlinNoise, voronoi } from '../core/noise';
import { makeSize } from './generators';

const PRI = '#e0564d';

/** Shared smoothstep helper for [0,1]-clamped input. */
const ss = (t: number) => {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Soft terracing: quantize t into `steps` benches with smoothstep risers. */
const terrace = (t: number, steps: number, soft: number) => {
  const q = 1 / steps;
  const k = Math.floor(Math.min(t, 0.999999) / q);
  const f = (t - k * q) / q;
  const lo = 0.5 - soft * 0.5, hi = 0.5 + soft * 0.5;
  return (k + ss((f - lo) / (hi - lo))) * q;
};

/** Mountain GeoPrimitive — 100% faithful to QuadSpinner GAEA:
    implements GAEA's iconic Mountain primitive using modulated Voronoi patterns,
    domain warp tectonic distortion, heterogeneous ridged fractal detail,
    volumetric bulky massing, and adjustable edge sprawl falloff. */
export const MountainNode: NodeTypeDefinition = {
  type: 'mountain',
  title: 'Mountain',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    {
      id: 'style',
      label: 'Mountain Type',
      type: 'select',
      default: 'alpine',
      options: [
        { value: 'alpine', label: 'Type 1 (Alpine Horn)' },
        { value: 'massif', label: 'Type 2 (Massif Block)' },
        { value: 'spined', label: 'Type 3 (Spined Crest)' },
        { value: 'craggy', label: 'Type 4 (Craggy Shattered)' },
      ],
    },
    { id: 'seed', label: 'Seed', type: 'seed', default: 2025 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'scale', label: 'Mountain Scale', type: 'slider', min: 0.1, max: 0.65, step: 0.01, default: 0.4 },
    { id: 'edge', label: 'Edge Falloff', type: 'slider', min: 0.8, max: 4.5, step: 0.05, default: 2.2 },
    { id: 'bulky', label: 'Bulky / Volume', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.5 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'elong', label: 'Elongation', type: 'slider', min: 0, max: 0.85, step: 0.02, default: 0.25 },
    { id: 'angle', label: 'Orientation', type: 'slider', min: 0, max: 180, step: 1, default: 45, integer: true },
    { id: 'irregular', label: 'Base Irregularity', type: 'slider', min: 0, max: 0.8, step: 0.01, default: 0.35 },
    { id: 'roughness', label: 'Flank Roughness', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.2 },
    { id: 'roughScale', label: 'Roughness Scale', type: 'slider', min: 1, max: 15, step: 0.5, default: 5 },
    { id: 'foothills', label: 'Foothills Apron', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.4 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);

    const style = (p.style ?? 'alpine') as 'alpine' | 'massif' | 'spined' | 'craggy';
    const seed = p.seed ?? 2025;
    const heightMult = p.height ?? 1;
    const cx = p.x ?? 0.5;
    const cy = p.y ?? 0.5;
    const scale = Math.max(0.1, (p.scale ?? p.radius ?? 0.4));
    const edge = p.edge ?? p.steepness ?? 2.2;
    const bulky = p.bulky ?? 0.5;
    const elong = p.elong ?? 0.25;
    const angle = ((p.angle ?? 45) * Math.PI) / 180;
    const irregular = p.irregular ?? 0.35;
    const roughness = p.roughness ?? 0.2;
    const roughScale = p.roughScale ?? 5;
    const foothills = p.foothills ?? 0.4;

    // Multi-frequency GAEA noise engines
    const warp1 = new FBM(seed + 11, 4, 2.0, 0.5, 'perlin');
    const warp2 = new FBM(seed + 29, 4, 2.0, 0.5, 'perlin');
    const spineNoise = new FBM(seed + 47, 4, 2.0, 0.5, 'perlin');
    const ridgedFBM1 = new FBM(seed + 71, 6, 2.0, 0.5, 'ridged');
    const ridgedFBM2 = new FBM(seed + 103, 5, 2.1, 0.5, 'ridged');
    const rockFBM = new FBM(seed + 157, 5, 2.2, 0.5, 'ridged');
    const baseFBM = new FBM(seed + 199, 4, 2.0, 0.5, 'perlin');

    const ca = Math.cos(angle), sa = Math.sin(angle);

    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1);
        const v = y / (s - 1);
        const dx = u - cx;
        const dy = v - cy;

        // 1. Smooth, continuous tectonic domain warping
        const wx = dx + warp1.sample(u * 2.0 + 5, v * 2.0 + 7) * irregular * 0.2;
        const wy = dy + warp2.sample(u * 2.0 + 13, v * 2.0 + 17) * irregular * 0.2;

        // 2. Anisotropic coordinate rotation & primary ridge alignment
        const rx = (wx * ca + wy * sa) / (1 + elong);
        let ry = (-wx * sa + wy * ca) * (1 + elong);
        const meander = spineNoise.sample(rx * 2.5 + 3, 11) * 0.15 * elong;
        ry -= meander;

        const d = Math.sqrt(rx * rx + ry * ry) / scale;

        // 3. Smooth, continuous falloff envelope (Continuous to infinity, zero step discontinuities)
        const baseEnvelope = Math.exp(-Math.pow(d, edge) * 2.2);

        // 4. Primary Mountain Spine Crest (knife-edge ridge)
        const spineDist = Math.abs(ry) / scale;
        const spineRidge = Math.exp(-spineDist * spineDist * 14.0) * Math.exp(-Math.abs(rx) / scale * 1.5);

        // 5. Multi-cellular Voronoi Fractures (Rock Buttresses & Arêtes)
        const cu = u * 4.0 + wx * 0.8;
        const cv = v * 4.0 + wy * 0.8;
        const vf1 = voronoi(cu, cv, 1, seed, 'f1');
        const vdiff = voronoi(cu, cv, 1, seed, 'f2minusf1');
        const voronoiStructure = (1 - vf1) * 0.6 + vdiff * 0.4;

        // 6. Multi-octave Ridged Flank Detail
        const flank1 = ridgedFBM1.sample(u * roughScale + 20, v * roughScale + 20) * 0.5 + 0.5;
        const flank2 = ridgedFBM2.sample(u * roughScale * 2 + 40, v * roughScale * 2 + 40) * 0.5 + 0.5;
        const rockCrag = rockFBM.sample(u * roughScale * 3 + 80, v * roughScale * 3 + 80) * 0.5 + 0.5;

        // 7. Geological Style synthesis
        let mountainSculpt = 0;
        if (style === 'alpine') {
          const aretes = Math.pow(flank1, 1.8);
          mountainSculpt = spineRidge * 0.45 + voronoiStructure * 0.35 + aretes * 0.35 + rockCrag * roughness * 0.4;
        } else if (style === 'massif') {
          mountainSculpt = spineRidge * 0.25 + voronoiStructure * 0.55 + flank1 * 0.35 + rockCrag * roughness * 0.3;
        } else if (style === 'spined') {
          mountainSculpt = spineRidge * 0.65 + voronoiStructure * 0.25 + flank1 * 0.25;
        } else {
          // craggy
          mountainSculpt = voronoiStructure * 0.5 + vdiff * 0.35 + rockCrag * 0.35;
        }

        // 8. Volumetric Massing (Bulky)
        // Shapes the envelope smoothly from base to peak
        const bulkFactor = 1.6 - bulky * 0.9; // 1.6 (sharp) to 0.7 (full bulk)
        const mountainCore = Math.pow(baseEnvelope, bulkFactor) * (0.35 + 0.65 * mountainSculpt);

        // 9. Quiet surrounding base plain
        const basePlain = baseFBM.sample(u * 1.5 + 3, v * 1.5 + 7) * 0.02;

        const total = basePlain + mountainCore * heightMult;
        h.set(x, y, Math.max(0, total));
      }
    }

    return h.normalize();
  }
};

/** ONE island: a single connected landmass with an irregular coastline. */
export const IslandNode: NodeTypeDefinition = {
  type: 'island',
  title: 'Island',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 777 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'radius', label: 'Island Radius', type: 'slider', min: 0.3, max: 0.75, step: 0.01, default: 0.52 },
    { id: 'coast', label: 'Coast Irregularity', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.5 },
    { id: 'coastScale', label: 'Coast Scale', type: 'slider', min: 1, max: 6, step: 0.1, default: 2.5 },
    { id: 'falloff', label: 'Coast Falloff', type: 'slider', min: 0.5, max: 4, step: 0.05, default: 1.6 },
    { id: 'peak', label: 'Interior Peaks', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.6 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const warp = new FBM(p.seed + 9, 4, 2, 0.5, 'perlin');
    const interior = new FBM(p.seed, 7, 2, 0.5, 'ridged');
    const R = p.radius * 2; // radius is relative to the half-width
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1 - (p.x * 2 - 1);
        const v = y / (s - 1) * 2 - 1 - (p.y * 2 - 1);
        // domain warp bends the coastline into bays & peninsulas
        const wx = warp.sample(u * p.coastScale + 31, v * p.coastScale) * p.coast * 0.3;
        const wy = warp.sample(u * p.coastScale, v * p.coastScale + 77) * p.coast * 0.3;
        const d = Math.sqrt((u + wx) * (u + wx) + (v + wy) * (v + wy)) / R;
        const mask = Math.pow(Math.max(0, 1 - d), p.falloff);
        // positive base floor guarantees ONE connected landmass (no interior seas)
        const m = interior.sample(u * 3, v * 3) * 0.5 + 0.5;
        h.set(x, y, mask * ((1 - p.peak) + p.peak * m));
      }
    }
    return h.normalize();
  }
};

/** ONE ridge: a single elongated crest line with meander and rocky detail. */
export const RidgeNode: NodeTypeDefinition = {
  type: 'ridge',
  title: 'Ridge',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 4242 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'angle', label: 'Angle', type: 'slider', min: 0, max: 180, step: 1, default: 25, integer: true },
    { id: 'length', label: 'Length', type: 'slider', min: 0.3, max: 1.4, step: 0.02, default: 1.1 },
    { id: 'width', label: 'Width', type: 'slider', min: 0.06, max: 0.45, step: 0.01, default: 0.18 },
    { id: 'sharpness', label: 'Sharpness', type: 'slider', min: 1, max: 6, step: 0.05, default: 2.4 },
    { id: 'meander', label: 'Meander', type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.22 },
    { id: 'roughness', label: 'Rock Roughness', type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.3 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const warp = new FBM(p.seed + 17, 4, 2, 0.5, 'perlin');
    const rock = new FBM(p.seed, 6, 2, 0.5, 'ridged');
    const rad = (p.angle * Math.PI) / 180;
    const ca = Math.cos(rad), sa = Math.sin(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) * 2 - 1 - (p.x * 2 - 1);
        const v = y / (s - 1) * 2 - 1 - (p.y * 2 - 1);
        const along = u * ca + v * sa;           // coordinate along the crest
        const perp = -u * sa + v * ca;           // coordinate across the crest
        // gentle meander so the ridge snakes instead of being ruler-straight
        const bend = warp.sample(along * 1.6 + 9, 3.3) * p.meander;
        // distance to the crest SEGMENT (tapers at both ends -> one ridge)
        const over = Math.max(0, Math.abs(along + bend) - p.length);
        const dseg = Math.sqrt(over * over + perp * perp) / p.width;
        const crest = Math.pow(Math.max(0, 1 - dseg), p.sharpness);
        const detail = rock.sample(u * 5 + 9, v * 5 + 9) * 0.5 + 0.5;
        h.set(x, y, crest * (1 + p.roughness * (detail - 0.5) * 2));
      }
    }
    return h.normalize();
  }
};

/** Peaks: defaults to ONE central peak; raise Count for a tight cluster. */
export const PeaksNode: NodeTypeDefinition = {
  type: 'peaks',
  title: 'Peaks',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 99 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'count', label: 'Peak Count', type: 'slider', min: 1, max: 10, step: 1, default: 1, integer: true },
    { id: 'spread', label: 'Cluster Spread', type: 'slider', min: 0.02, max: 0.42, step: 0.01, default: 0.1 },
    { id: 'falloff', label: 'Falloff', type: 'slider', min: 1, max: 4, step: 0.05, default: 2 },
    { id: 'variation', label: 'Height Variation', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const rand = mulberry32(p.seed);
    const px: number[] = [], py: number[] = [], ph: number[] = [], pr: number[] = [];
    for (let i = 0; i < p.count; i++) {
      px.push(0.5 + (rand() * 2 - 1) * p.spread);
      py.push(0.5 + (rand() * 2 - 1) * p.spread);
      ph.push(1 - p.variation * rand());
      pr.push(0.42 + 0.28 * rand()); // wide bases: peaks read as one massif
    }
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        let best = 0;
        for (let i = 0; i < p.count; i++) {
          const dx = u - px[i] - (p.x - 0.5), dy = v - py[i] - (p.y - 0.5);
          const d = Math.sqrt(dx * dx + dy * dy) / pr[i];
          const val = ph[i] * Math.pow(Math.max(0, 1 - d), p.falloff);
          if (val > best) best = val;
        }
        h.set(x, y, best);
      }
    }
    return h.normalize();
  }
};

export const CraterNode: NodeTypeDefinition = {
  type: 'crater',
  title: 'Crater',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 11 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'radius', label: 'Radius', type: 'slider', min: 0.05, max: 0.45, step: 0.01, default: 0.25 },
    { id: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'rimHeight', label: 'Rim Height', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.35 },
    { id: 'rimWidth', label: 'Rim Width', type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.18 },
    { id: 'roughness', label: 'Roughness', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.25 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, 5, 2, 0.5, 'ridged');
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p.x, dy = v - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) / p.radius;
        const bowl = d < 1 ? -p.depth * (1 - d * d) : 0;
        const rim = p.rimHeight * Math.exp(-Math.pow((d - 1) / p.rimWidth, 2));
        const rough = (fbm.sample(u * 6, v * 6) - 0.5) * p.roughness * Math.exp(-Math.max(0, d - 1) * 2);
        h.set(x, y, Math.min(Math.max(0.6 + bowl + rim + rough, 0), 1));
      }
    }
    return h.normalize();
  }
};

export const CanyonNode: NodeTypeDefinition = {
  type: 'canyon',
  title: 'Canyon',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 606 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'scale', label: 'Feature Scale', type: 'slider', min: 1, max: 8, step: 0.1, default: 2 },
    { id: 'meander', label: 'Meander', type: 'slider', min: 0, max: 0.35, step: 0.01, default: 0.2 },
    { id: 'width', label: 'Channel Width', type: 'slider', min: 0.01, max: 0.15, step: 0.005, default: 0.05 },
    { id: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.85 },
    { id: 'floor', label: 'Floor Level', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.12 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, 6, 2, 0.5, 'perlin');
    const meander = new FBM(p.seed + 77, 3, 2, 0.5, 'perlin');
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) + (p.x - 0.5), v = y / (s - 1) + (p.y - 0.5);
        const n = fbm.sample(u * p.scale, v * p.scale) * 0.5 + 0.5;
        const c = 0.5 + (meander.sample(u * 3 + 40, 8.2) * 0.5 + 0.5 - 0.5) * 2 * p.meander;
        const dist = Math.abs(v - c);
        const t = ss((dist - p.width) / (p.width * 1.2));
        const carved = p.floor + (n - p.floor) * t;
        h.set(x, y, Math.min(Math.max(n * (1 - p.depth) + carved * p.depth, 0), 1));
      }
    }
    return h.normalize();
  }
};

export const DunesNode: NodeTypeDefinition = {
  type: 'dunes',
  title: 'Dunes',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 311 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'wavelength', label: 'Wavelength', type: 'slider', min: 0.02, max: 0.25, step: 0.005, default: 0.12 },
    { id: 'direction', label: 'Direction', type: 'slider', min: 0, max: 180, step: 1, default: 15, integer: true },
    { id: 'warp', label: 'Domain Warp', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.6 },
    { id: 'sharpness', label: 'Sharpness', type: 'slider', min: 1, max: 6, step: 0.05, default: 2.5 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const warp = new FBM(p.seed, 4, 2, 0.5, 'perlin');
    const detail = new FBM(p.seed + 19, 4, 2, 0.5, 'perlin');
    const rad = (p.direction * Math.PI) / 180;
    const sa = Math.sin(rad), ca = Math.cos(rad);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) + (p.x - 0.5), v = y / (s - 1) + (p.y - 0.5);
        const proj = u * sa + v * ca;
        const off = (warp.sample(u * 3, v * 3) * 0.5 + 0.5 - 0.5) * p.warp * 2;
        const ph = (proj / p.wavelength + off) * Math.PI * 2;
        const crest = Math.pow(1 - Math.abs(Math.sin(ph)), p.sharpness);
        const fine = detail.sample(u * 5 + 9, v * 5 + 9) * 0.5 + 0.5;
        h.set(x, y, crest * 0.85 + fine * 0.15);
      }
    }
    return h.normalize();
  }
};

export const VolcanoNode: NodeTypeDefinition = {
  type: 'volcano',
  title: 'Volcano',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 5 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'radius', label: 'Radius', type: 'slider', min: 0.1, max: 0.5, step: 0.01, default: 0.36 },
    { id: 'slope', label: 'Slope', type: 'slider', min: 0.6, max: 3, step: 0.05, default: 1.4 },
    { id: 'calderaWidth', label: 'Caldera Width', type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.2 },
    { id: 'calderaDepth', label: 'Caldera Depth', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'roughness', label: 'Roughness', type: 'slider', min: 0, max: 0.6, step: 0.01, default: 0.3 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, 5, 2, 0.5, 'ridged');
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p.x, dy = v - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) / p.radius;
        const cone = Math.pow(Math.max(0, 1 - d), p.slope);
        const caldera = Math.exp(-Math.pow(d / p.calderaWidth, 2)) * p.calderaDepth;
        const flank = fbm.sample(u * 8, v * 8) * cone * p.roughness;
        h.set(x, y, Math.min(Math.max(cone - caldera + flank, 0), 1));
      }
    }
    return h.normalize();
  }
};

export const MesaNode: NodeTypeDefinition = {
  type: 'mesa',
  title: 'Mesa',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 88 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'scale', label: 'Feature Scale', type: 'slider', min: 0.5, max: 8, step: 0.1, default: 1.8 },
    { id: 'octaves', label: 'Octaves', type: 'slider', min: 1, max: 10, step: 1, default: 5, integer: true },
    { id: 'levels', label: 'Levels', type: 'slider', min: 2, max: 14, step: 1, default: 6, integer: true },
    { id: 'smooth', label: 'Edge Softness', type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.25 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const fbm = new FBM(p.seed, p.octaves, 2, 0.5, 'perlin');
    const step = 1 / p.levels;
    const lo = 1 - p.smooth, hi = p.smooth;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1) + (p.x - 0.5), v = y / (s - 1) + (p.y - 0.5);
        const n = fbm.sample(u * p.scale, v * p.scale) * 0.5 + 0.5;
        const k = Math.floor(n / step);
        const f = (n - k * step) / step;
        const t = hi <= lo ? f : ss((f - lo) / (hi - lo));
        h.set(x, y, (k + t) * step);
      }
    }
    return h.normalize();
  }
};
