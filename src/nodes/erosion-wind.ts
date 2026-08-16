import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';

const ERO = '#3fb8a4';

/** Directional wind erosion — the third member of GAEA's erosion trio.
 *
 *  Model: wind blows along `direction`; every pixel whose surface faces the
 *  wind (higher than its upwind neighbour) gets abraded. The loosened
 *  material is carried a few steps downwind and deposited with geometric
 *  falloff; the `deposition` fraction controls how much settles vs. is lost
 *  as dust. Carry distance scales with map resolution so wind streaks look
 *  the same at 256² and 4096². Output is normalized like Thermal/Hydraulic. */
export const WindErosionNode: NodeTypeDefinition = {
  type: 'wind',
  title: 'Wind Erosion',
  category: 'Erosion',
  color: ERO,
  inputs: [{ id: 'in', label: 'Terrain' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'iterations', label: 'Iterations', type: 'slider', min: 1, max: 60, step: 1, default: 24, integer: true },
    { id: 'direction', label: 'Direction °', type: 'slider', min: 0, max: 360, step: 1, default: 45, integer: true },
    { id: 'strength', label: 'Strength', type: 'slider', min: 0.05, max: 1, step: 0.05, default: 0.45 },
    { id: 'reach', label: 'Carry Distance', type: 'slider', min: 1, max: 8, step: 1, default: 3, integer: true },
    { id: 'deposition', label: 'Deposition', type: 'slider', min: 0, max: 1, step: 0.05, default: 0.6 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in;
    if (!src) return new Heightmap(ctx.size);
    const s = src.size;
    const h = src.clone();
    const map = h.data;

    const rad = ((p.direction as number) * Math.PI) / 180;
    // unit wind vector in pixel space (y grows downward in map coords)
    const wx = Math.cos(rad), wy = Math.sin(rad);
    // resolution compensation: same physical carry distance at any resolution,
    // capped so very large maps don't blow up the cost
    const pxScale = Math.min(Math.max(s / 256, 1), 2);
    const reach = Math.max(1, Math.round((p.reach as number) * pxScale));

    // geometric deposition weights downwind, normalized to sum to 1
    const weights = new Float32Array(reach);
    let wsum = 0;
    for (let k = 1; k <= reach; k++) {
      weights[k - 1] = Math.pow(0.5, k);
      wsum += weights[k - 1];
    }
    for (let k = 0; k < reach; k++) weights[k] /= wsum;

    const strength = p.strength as number;
    const deposition = p.deposition as number;
    const deltas = new Float32Array(s * s);

    for (let it = 0; it < (p.iterations as number); it++) {
      deltas.fill(0);
      for (let y = 0; y < s; y++) {
        const row = y * s;
        for (let x = 0; x < s; x++) {
          const i = row + x;
          // upwind neighbour (one pixel against the wind)
          const ux = Math.round(x - wx), uy = Math.round(y - wy);
          if (ux < 0 || uy < 0 || ux >= s || uy >= s) continue;
          const diff = map[i] - map[uy * s + ux];
          if (diff <= 0) continue; // only wind-facing faces abrade
          const erode = diff * strength * 0.5;
          deltas[i] -= erode;
          const carry = erode * deposition;
          if (carry <= 0) continue;
          for (let k = 1; k <= reach; k++) {
            const tx = Math.round(x + wx * k), ty = Math.round(y + wy * k);
            if (tx < 0 || ty < 0 || tx >= s || ty >= s) continue;
            deltas[ty * s + tx] += carry * weights[k - 1];
          }
        }
      }
      for (let i = 0; i < map.length; i++) map[i] += deltas[i];
    }

    // normalize like the other erosion nodes
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < map.length; i++) {
      if (map[i] < mn) mn = map[i];
      if (map[i] > mx) mx = map[i];
    }
    const r = mx - mn || 1;
    for (let i = 0; i < map.length; i++) map[i] = (map[i] - mn) / r;
    return h;
  }
};
