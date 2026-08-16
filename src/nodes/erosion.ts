import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { mulberry32 } from '../core/noise';
import { makeSize } from './generators';

const ERO = '#3fb8a4';

/** Precomputed erosion brush offsets + normalized weights. */
export function makeBrush(radius: number): { offsets: Int32Array; weights: Float32Array } {
  const offs: number[] = [];
  const wts: number[] = [];
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) {
        const w = 1 - d / (radius + 1);
        offs.push(dx, dy);
        wts.push(w);
        total += w;
      }
    }
  }
  return {
    offsets: new Int32Array(offs),
    weights: new Float32Array(wts.map(w => w / total))
  };
}

export function sampleGradient(h: Heightmap, px: number, py: number): { gx: number; gy: number; height: number } {
  const s = h.size;
  const cx = Math.min(Math.max(px, 0), s - 1.001);
  const cy = Math.min(Math.max(py, 0), s - 1.001);
  const ix = Math.floor(cx), iy = Math.floor(cy);
  const fx = cx - ix, fy = cy - iy;
  const i00 = iy * s + ix;
  const i10 = i00 + (ix + 1 < s ? 1 : 0);
  const i01 = i00 + (iy + 1 < s ? s : 0);
  const i11 = i10 + (iy + 1 < s ? s : 0);
  const d = h.data;
  const h00 = d[i00], h10 = d[i10], h01 = d[i01], h11 = d[i11];
  const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
  const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
  const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
  return { gx, gy, height };
}

export const HydraulicErosionNode: NodeTypeDefinition = {
  type: 'hydraulic',
  title: 'Hydraulic Erosion',
  category: 'Erosion',
  color: ERO,
  inputs: [{ id: 'in', label: 'Terrain' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'seed', label: 'Seed', type: 'seed', default: 7 },
    { id: 'droplets', label: 'Droplets (k)', type: 'slider', min: 1, max: 150, step: 1, default: 50, integer: true },
    { id: 'lifetime', label: 'Max Lifetime', type: 'slider', min: 8, max: 80, step: 1, default: 42, integer: true },
    { id: 'inertia', label: 'Inertia', type: 'slider', min: 0, max: 0.95, step: 0.05, default: 0.05 },
    { id: 'capacity', label: 'Capacity', type: 'slider', min: 1, max: 12, step: 0.5, default: 5 },
    { id: 'erode', label: 'Erosion Rate', type: 'slider', min: 0.05, max: 1, step: 0.05, default: 0.45 },
    { id: 'deposit', label: 'Deposit Rate', type: 'slider', min: 0.05, max: 1, step: 0.05, default: 0.3 },
    { id: 'evaporate', label: 'Evaporation', type: 'slider', min: 0.005, max: 0.1, step: 0.005, default: 0.02 },
    { id: 'gravity', label: 'Gravity', type: 'slider', min: 1, max: 8, step: 0.5, default: 5 },
    { id: 'radius', label: 'Brush Radius', type: 'slider', min: 1, max: 6, step: 1, default: 3, integer: true },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const s = src.size;
    const h = src.clone();
    const map = h.data;
    const rand = mulberry32(p.seed * 7919 + 13);
    const brush = makeBrush(p.radius);

    // Resolution independence (GAEA-like): work in *physical* units.
    // 1 pixel at size s spans 1/scale base-pixels (base = 256), so the physical
    // slope is deltaH*scale. Droplet count scales with area and step count with
    // scale, so 256² and 4K carve the same drainage networks.
    const scale = Math.max(1, s / 256);
    // droplets scale with area (floored at 1 so low-res still carves, capped so 8K stays usable)
    const dropFactor = Math.min(Math.max((s / 512) ** 2, 1), 8);
    const nDrops = Math.round(p.droplets * 1000 * dropFactor);
    const steps = p.lifetime;
    // each step spans `scale` pixels so deltaH is a physical (resolution-independent) slope
    const stepLen = scale;

    const minSlope = 0.0008;
    const maxErode = 0.02;

    for (let d = 0; d < nDrops; d++) {
      let px = rand() * (s - 1);
      let py = rand() * (s - 1);
      let dirX = 0, dirY = 0;
      let speed = 1;
      let water = 1;
      let sediment = 0;

      for (let life = 0; life < steps; life++) {
        if (px < 1 || py < 1 || px >= s - 2 || py >= s - 2) break;
        const { gx, gy, height } = sampleGradient(h, px, py);

        // Inertia: keep part of the previous heading so channels meander
        // instead of running straight down the gradient.
        dirX = dirX * p.inertia - gx * (1 - p.inertia);
        dirY = dirY * p.inertia - gy * (1 - p.inertia);
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        if (!isFinite(len) || len < 1e-6) break;
        dirX /= len; dirY /= len;

        const nx = px + dirX * stepLen, ny = py + dirY * stepLen;
        if (nx < 1 || ny < 1 || nx >= s - 2 || ny >= s - 2) break;
        const newHeight = h.sample(nx / (s - 1), ny / (s - 1));
        const deltaH = newHeight - height;          // physical height change over stepLen
        const slope = -deltaH;                      // physical downhill slope

        // Sediment capacity (Lague): steeper + faster + wetter = carries more.
        const cap = Math.max(slope, minSlope) * speed * water * p.capacity * 0.4;

        const ix = Math.floor(px), iy = Math.floor(py);
        if (sediment < cap) {
          // EROSION: dig proportional to spare capacity, clamped per step.
          const amount = Math.min((cap - sediment) * p.erode, maxErode);
          for (let b = 0; b < brush.weights.length; b++) {
            const bx = ix + brush.offsets[b * 2];
            const by = iy + brush.offsets[b * 2 + 1];
            if (bx >= 0 && by >= 0 && bx < s && by < s) {
              map[by * s + bx] -= amount * brush.weights[b];
            }
          }
          sediment += amount;
        } else {
          // DEPOSITION: anti-cone clamp — when climbing, never fill above the
          // next cell's height; otherwise shed only the excess, gently.
          const amount = deltaH > 0
            ? Math.min(sediment, deltaH) * p.deposit
            : (sediment - cap) * p.deposit;
          for (let b = 0; b < brush.weights.length; b++) {
            const bx = ix + brush.offsets[b * 2];
            const by = iy + brush.offsets[b * 2 + 1];
            if (bx >= 0 && by >= 0 && bx < s && by < s) {
              map[by * s + bx] += amount * brush.weights[b];
            }
          }
          sediment -= amount;
        }

        // Speed: accelerate downhill, bleed off uphill.
        speed = Math.min(Math.max(speed + slope * p.gravity * 0.2, 0.5), 4);
        water *= 1 - p.evaporate;
        if (water < 0.02) break;
        px = nx; py = ny;
      }
    }

    return h.normalize();
  }
};
