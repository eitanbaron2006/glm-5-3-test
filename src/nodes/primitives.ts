/* GAEA-style primitive terrain shapes.

   DESIGN RULE (GAEA-like): every primitive emits exactly ONE feature —
   one mountain, one island, one ridge, one peak. Multi-feature terrain
   is composed by combining multiple nodes in the graph (Blend/Add). */
import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { FBM, mulberry32 } from '../core/noise';
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

/** ONE mountain rising from graded lowlands: the massif has a noise-warped
    (non-circular) outline and sits on an apron of benched foothills that
    descends step-wise into low plains covering the ENTIRE chunk. */
export const MountainNode: NodeTypeDefinition = {
  type: 'mountain',
  title: 'Mountain',
  category: 'Primitives',
  color: PRI,
  inputs: [],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 2025 },
    { id: 'height', label: 'Height', type: 'slider', min: 0, max: 2, step: 0.01, default: 1 },
    { id: 'x', label: 'Center X', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'y', label: 'Center Y', type: 'slider', min: 0, max: 1, step: 0.01, default: 0.5 },
    { id: 'radius', label: 'Radius', type: 'slider', min: 0.15, max: 0.5, step: 0.01, default: 0.3 },
    { id: 'steepness', label: 'Steepness', type: 'slider', min: 0.8, max: 5, step: 0.05, default: 2.3 },
    { id: 'elong', label: 'Elongation', type: 'slider', min: 0, max: 0.8, step: 0.02, default: 0.25 },
    { id: 'angle', label: 'Orientation', type: 'slider', min: 0, max: 180, step: 1, default: 35, integer: true },
    { id: 'irregular', label: 'Base Irregularity', type: 'slider', min: 0, max: 0.6, step: 0.01, default: 0.38 },
    { id: 'foothills', label: 'Foothills', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.55 },
    { id: 'benches', label: 'Foothill Benches', type: 'slider', min: 0, max: 1, step: 0.02, default: 0.4 },
    { id: 'roughness', label: 'Flank Roughness', type: 'slider', min: 0, max: 0.5, step: 0.01, default: 0.18 },
    { id: 'roughScale', label: 'Roughness Scale', type: 'slider', min: 2, max: 14, step: 0.5, default: 5 },
  ],
  compute(_inputs, p, ctx) {
    const s = makeSize(ctx.size);
    const h = new Heightmap(s);
    const flank = new FBM(p.seed, 6, 2, 0.5, 'ridged');       // gullies on the cone
    const hills = new FBM(p.seed + 41, 5, 2, 0.5, 'perlin');  // rolling foothills
    const plain = new FBM(p.seed + 97, 4, 2, 0.5, 'perlin');  // whole-chunk lowlands
    const rimA = new FBM(p.seed + 13, 4, 2, 0.5, 'perlin');   // broad perimeter lobes
    const rimB = new FBM(p.seed + 29, 3, 2, 0.5, 'billow');   // fine perimeter gnarl
    const rot = p.angle * Math.PI / 180;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = x / (s - 1), v = y / (s - 1);
        const dx = u - p.x, dy = v - p.y;
        // rotate the frame and stretch one axis: real massifs are elongated
        const rx = (dx * ca + dy * sa) / (1 + p.elong);
        const ry = (-dx * sa + dy * ca) * (1 + p.elong);
        // polar-fractal perimeter: noise sampled on a circle is seamless in the
        // angle, so the outline gets multi-frequency lobes instead of a round blob
        const th = Math.atan2(dy, dx);
        const wa = rimA.sample(Math.cos(th) * 1.7 + 17, Math.sin(th) * 1.7 + 17);
        const wb = rimB.sample(Math.cos(th) * 4.3 + 53, Math.sin(th) * 4.3 + 53);
        const d = Math.sqrt(rx * rx + ry * ry) / p.radius
          * (1 + p.irregular * (0.62 * wa + 0.38 * wb));

        // ---- the massif: one steep cone with ridged flank detail ----
        const cone = Math.pow(Math.max(0, 1 - d), p.steepness);
        const gully = flank.sample(u * p.roughScale + 100, v * p.roughScale + 100) * 0.5 + 0.5;
        const peak = cone * (1 + p.roughness * (gully - 0.5) * 2);

        // ---- graded apron spanning the whole chunk ----
        // pediment influence: strong at the core, decaying outward across the map
        const ped = Math.exp(-d * d * 0.45);
        // terrace the ramp so the descent from the massif reads as stepped benches
        const ramp = lerp(ped, terrace(ped, 5, 0.55), p.benches);
        const hillN = hills.sample(u * 3.5 + 31, v * 3.5 + 31) * 0.5 + 0.5;
        const plainN = plain.sample(u * 1.5 + 7, v * 1.5 + 7) * 0.5 + 0.5;
        // low plains cover the entire chunk; they swell and climb near the massif
        const ground = plainN * 0.10 + ramp * (0.06 + 0.3 * p.foothills) * (0.55 + 0.45 * hillN);

        h.set(x, y, Math.max(0, ground + peak));
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
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
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
        const u = x / (s - 1) * 2 - 1;
        const v = y / (s - 1) * 2 - 1;
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
          const dx = u - px[i], dy = v - py[i];
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
        const u = x / (s - 1), v = y / (s - 1);
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
        const u = x / (s - 1), v = y / (s - 1);
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
        const u = x / (s - 1), v = y / (s - 1);
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
