import { Heightmap } from '../core/heightmap';
import { NodeTypeDefinition } from '../core/graph';
import { makeSize } from './generators';

const ERO = '#246b62';

export const ThermalErosionNode: NodeTypeDefinition = {
  type: 'thermal',
  title: 'Thermal Erosion',
  category: 'Erosion',
  color: ERO,
  inputs: [{ id: 'in', label: 'Terrain' }],
  outputs: [{ id: 'out', label: 'Out' }],
  params: [
    { id: 'iterations', label: 'Iterations', type: 'slider', min: 1, max: 60, step: 1, default: 20, integer: true },
    { id: 'talus', label: 'Talus Threshold', type: 'slider', min: 0.001, max: 0.1, step: 0.001, default: 0.02 },
    { id: 'amount', label: 'Amount', type: 'slider', min: 0.05, max: 1, step: 0.05, default: 0.5 },
  ],
  compute(inputs, p, ctx) {
    const src = inputs.in ?? new Heightmap(makeSize(ctx.size)).fill(0.5);
    const s = src.size;
    const h = src.clone();
    const map = h.data;
    const talus = p.talus * (256 / s);
    const diffs = new Float32Array(8);
    const dx8 = [-1, 1, 0, 0, -1, 1, -1, 1];
    const dy8 = [0, 0, -1, 1, -1, -1, 1, 1];
    const deltas = new Float32Array(s * s);

    for (let it = 0; it < p.iterations; it++) {
      deltas.fill(0);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = y * s + x;
          const hv = map[i];
          let total = 0;
          for (let n = 0; n < 8; n++) {
            const nx = x + dx8[n], ny = y + dy8[n];
            const d = (nx >= 0 && ny >= 0 && nx < s && ny < s) ? hv - map[ny * s + nx] : 0;
            diffs[n] = d > talus ? d - talus : 0;
            total += diffs[n];
          }
          if (total <= 0) continue;
          const move = total * p.amount * 0.25;
          for (let n = 0; n < 8; n++) {
            if (diffs[n] <= 0) continue;
            const nx = x + dx8[n], ny = y + dy8[n];
            deltas[ny * s + nx] += move * (diffs[n] / total);
          }
          deltas[i] -= move;
        }
      }
      for (let i = 0; i < map.length; i++) map[i] += deltas[i];
    }

    // preserve incoming amplitude (no normalize) so upstream Height survives
    return h;
  }
};
